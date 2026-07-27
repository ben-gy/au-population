// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/**
 * parse.mjs — dependency-free parsing + aggregation for au-population.
 *
 * Imports NOTHING (no fs, no network) so the exact same code the pipeline runs
 * is unit-tested in the browser test env. All shaping of ABS Regional Population
 * data into the site's model lives here.
 *
 * Two ABS sources feed this, both SDMX-CSV from data.api.abs.gov.au:
 *   1. ABS_ANNUAL_ERP_LGA2024 — Estimated Resident Population per LGA, 2001→2024.
 *   2. ERP_COMP_LGA2024 / ERP_COMP_LGA2021 — components of population change
 *      (births, deaths, net internal migration, net overseas migration), which
 *      are the four engines the whole site exists to separate.
 */

/** CL_POP_COMP code → field name. */
export const COMP = {
  1: 'births',
  2: 'deaths',
  3: 'natural', // natural increase = births - deaths
  4: 'internalArrivals',
  5: 'internalDepartures',
  6: 'netInternal', // net internal migration (zero-sum nationally)
  7: 'overseasArrivals',
  8: 'overseasDepartures',
  9: 'netOverseas', // net overseas migration
  10: 'erp', // estimated resident population (also in the long series — used to reconcile)
};

/**
 * Minimal RFC-4180-ish CSV reader. ABS OBS_COMMENT can contain quoted commas,
 * so a naive split() is wrong. Returns array of string arrays (incl. header).
 */
export function readCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** SDMX-CSV → array of objects keyed by header. */
export function parseSdmx(text) {
  const rows = readCsv(text.trim());
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].length === 1 && rows[r][0] === '') continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = (rows[r][c] ?? '').trim();
    out.push(obj);
  }
  return out;
}

/** Parse an ABS OBS_VALUE. Blank / non-numeric → null (never a confident 0). */
export function num(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === '' || t === 'NaN') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the ERP (population) series per LGA from the long annual flow.
 * Rows are the parsed ABS_ANNUAL_ERP_LGA2024 objects (MEASURE=ERP, SEX_ABS=3,
 * AGE=TOT already filtered by the query, REGION_TYPE=LGA2024).
 * Returns Map<code, {name?, series: {year: pop}}>. Names come from geo, so
 * this only carries the numeric series.
 */
export function buildErpSeries(erpRows) {
  const map = new Map();
  for (const row of erpRows) {
    if (row.REGION_TYPE !== 'LGA2024') continue;
    const code = row.LGA_2024;
    if (!code) continue;
    const year = Number(row.TIME_PERIOD);
    const pop = num(row.OBS_VALUE);
    if (pop == null || !Number.isFinite(year)) continue;
    if (!map.has(code)) map.set(code, { series: {} });
    map.get(code).series[year] = pop;
  }
  return map;
}

/**
 * Build components per LGA per year from one or more stitched component flows.
 * `flows` is an array of { rows, regionType } where regionType is the
 * REGION_TYPE value that marks LGA rows in that flow (e.g. 'LGA2024','LGA2021').
 * Only codes in `validCodes` (the 2024 boundary set) are kept, so edition drift
 * between flows can't invent regions. Later flows win on year collisions.
 * Returns Map<code, {years: {year: {births,deaths,natural,netInternal,netOverseas,...,erp}}}>.
 */
export function buildComponents(flows, validCodes) {
  const map = new Map();
  for (const { rows, regionType } of flows) {
    for (const row of rows) {
      if (row.REGION_TYPE !== regionType) continue;
      const code = row.REGION;
      if (!validCodes || !validCodes.has(code)) continue;
      const field = COMP[Number(row.POP_COMP)];
      if (!field) continue;
      const year = Number(row.TIME_PERIOD);
      const val = num(row.OBS_VALUE);
      if (val == null || !Number.isFinite(year)) continue;
      if (!map.has(code)) map.set(code, { years: {} });
      const years = map.get(code).years;
      if (!years[year]) years[year] = {};
      years[year][field] = val;
    }
  }
  return map;
}

/**
 * National components per year by SUMMING the per-LGA component map. The AUS
 * region row only exists in the latest flow (2022-2024), so summing the kept
 * LGAs is the only way to get the full 2017→latest trend (and it exposes the
 * 2020-21 COVID collapse in net overseas migration). Valid because net internal
 * is zero-sum and every other component is additive.
 */
export function nationalSeriesFromComponents(compMap) {
  const out = {};
  const fields = ['births', 'deaths', 'natural', 'netInternal', 'netOverseas'];
  for (const { years } of compMap.values()) {
    for (const [year, comp] of Object.entries(years)) {
      if (!out[year]) out[year] = Object.fromEntries(fields.map((f) => [f, 0]));
      for (const f of fields) if (comp[f] != null) out[year][f] += comp[f];
    }
  }
  for (const y of Object.keys(out)) out[y].netMig = out[y].netInternal + out[y].netOverseas;
  return out;
}

/** Pull the national (AUS) component totals per year from a component flow. */
export function nationalComponents(rows) {
  const out = {};
  for (const row of rows) {
    if (row.REGION_TYPE !== 'AUS') continue;
    const field = COMP[Number(row.POP_COMP)];
    if (!field) continue;
    const year = Number(row.TIME_PERIOD);
    const val = num(row.OBS_VALUE);
    if (val == null) continue;
    if (!out[year]) out[year] = {};
    out[year][field] = val;
  }
  return out;
}

/** Round to `d` decimals, returning a Number (not string). */
export function round(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/**
 * Classify an LGA by its two structural rates.
 *  x = natural-increase rate (births-deaths per 1,000)
 *  y = net-migration rate (net internal + net overseas per 1,000)
 * Four demographic types that a single growth number hides.
 */
export function classify(natRate, migRate) {
  const nat = natRate ?? 0;
  const mig = migRate ?? 0;
  if (nat >= 0 && mig >= 0) return 'both'; // growing on both engines
  if (nat >= 0 && mig < 0) return 'natural'; // young but losing people
  if (nat < 0 && mig >= 0) return 'migration'; // ageing but attractive (sea/tree-change)
  return 'emptying'; // deaths outnumber births AND net outflow
}

export const TYPE_LABEL = {
  both: 'Growing on both engines',
  natural: 'Natural growth, net outflow',
  migration: 'Migration-fed, natural decline',
  emptying: 'Emptying (decline on both)',
};

/**
 * Assemble the full per-LGA model.
 * @param erpMap    Map from buildErpSeries
 * @param compMap   Map from buildComponents
 * @param names     Map<code, {name, state}>  (from geo / a name lookup)
 * @param latestYear the reference year (e.g. 2024)
 */
export function assemble(erpMap, compMap, names, latestYear) {
  const lgas = [];
  for (const [code, { series }] of erpMap) {
    const meta = names.get(code) || {};
    const years = Object.keys(series).map(Number).sort((a, b) => a - b);
    if (!years.length) continue;
    const popLatest = series[latestYear] ?? series[years[years.length - 1]];
    const prevYear = latestYear - 1;
    const popPrev = series[prevYear];
    const pop5 = series[latestYear - 5];
    const pop10 = series[latestYear - 10];
    const popFirst = series[years[0]];

    const comp = compMap.get(code)?.years?.[latestYear] || {};
    const denom = popLatest || 1;
    const natural = comp.natural ?? (comp.births != null && comp.deaths != null ? comp.births - comp.deaths : null);
    const netInternal = comp.netInternal ?? null;
    const netOverseas = comp.netOverseas ?? null;
    const netMig =
      netInternal != null || netOverseas != null ? (netInternal ?? 0) + (netOverseas ?? 0) : null;

    lgas.push({
      code,
      name: meta.name || code,
      state: meta.state || '',
      pop: popLatest ?? null,
      series, // full 2001→latest
      // growth
      growth1yr: popPrev ? round(((popLatest - popPrev) / popPrev) * 100, 2) : null,
      change1yr: popPrev != null ? popLatest - popPrev : null,
      growth5yr: pop5 ? round(((popLatest - pop5) / pop5) * 100, 2) : null,
      growth10yr: pop10 ? round(((popLatest - pop10) / pop10) * 100, 2) : null,
      growthAll: popFirst ? round(((popLatest - popFirst) / popFirst) * 100, 2) : null,
      firstYear: years[0],
      // components (latest year), raw counts
      births: comp.births ?? null,
      deaths: comp.deaths ?? null,
      natural,
      netInternal,
      netOverseas,
      netMig,
      totalChange:
        natural != null || netMig != null ? (natural ?? 0) + (netMig ?? 0) : null,
      // rates per 1,000 residents
      natRate: natural != null ? round((natural / denom) * 1000, 2) : null,
      netInternalRate: netInternal != null ? round((netInternal / denom) * 1000, 2) : null,
      netOverseasRate: netOverseas != null ? round((netOverseas / denom) * 1000, 2) : null,
      netMigRate: netMig != null ? round((netMig / denom) * 1000, 2) : null,
      type:
        natural != null && netMig != null
          ? classify((natural / denom) * 1000, (netMig / denom) * 1000)
          : null,
      // components time series (for per-LGA drawer / trends)
      compSeries: compMap.get(code)?.years || {},
    });
  }
  lgas.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  return lgas;
}

/**
 * Reconciliation gate. Throws on drift. Two INDEPENDENT ABS series must agree:
 *   (a) per-LGA ERP from the long annual flow == component-10 ERP from the
 *       component flow, at the reference year (proves both parsers read right);
 *   (b) net internal migration is zero-sum nationally (sum over LGAs ≈ 0), a
 *       structural identity ABS data must satisfy.
 * Tolerances are generous because ABS perturbs small cells.
 */
export function reconcile(lgas, compMap, latestYear) {
  // (a) ERP cross-source agreement
  let checked = 0;
  let mismatched = 0;
  for (const l of lgas) {
    const compErp = compMap.get(l.code)?.years?.[latestYear]?.erp;
    if (compErp == null || l.pop == null) continue;
    checked++;
    if (Math.abs(compErp - l.pop) > Math.max(3, l.pop * 0.001)) mismatched++;
  }
  if (checked < 400) throw new Error(`ERP cross-check ran on only ${checked} LGAs — join is broken`);
  if (mismatched > checked * 0.02)
    throw new Error(
      `ERP cross-source mismatch on ${mismatched}/${checked} LGAs — the two ABS series disagree`,
    );

  // (b) net internal migration zero-sum nationally
  let sumNetInternal = 0;
  let n = 0;
  for (const l of lgas) {
    if (l.netInternal != null) {
      sumNetInternal += l.netInternal;
      n++;
    }
  }
  const totalInternalFlow = lgas.reduce(
    (s, l) => s + Math.abs(l.netInternal ?? 0),
    0,
  );
  if (n > 400 && totalInternalFlow > 0 && Math.abs(sumNetInternal) > totalInternalFlow * 0.05)
    throw new Error(
      `net internal migration should sum to ~0 nationally but sums to ${sumNetInternal} (flow ${totalInternalFlow})`,
    );

  return { erpChecked: checked, erpMismatched: mismatched, netInternalResidual: sumNetInternal };
}

/** National roll-up for the overview. */
export function national(lgas, natComp, latestYear) {
  const totalPop = lgas.reduce((s, l) => s + (l.pop ?? 0), 0);
  const nc = natComp[latestYear] || {};
  const counts = { both: 0, natural: 0, migration: 0, emptying: 0 };
  let growing = 0;
  let shrinking = 0;
  for (const l of lgas) {
    if (l.type) counts[l.type]++;
    if (l.totalChange != null) (l.totalChange >= 0 ? growing++ : shrinking++);
  }
  return {
    latestYear,
    totalPop,
    births: nc.births ?? null,
    deaths: nc.deaths ?? null,
    natural: nc.natural ?? null,
    netInternal: nc.netInternal ?? null,
    netOverseas: nc.netOverseas ?? null,
    netMig: nc.netInternal != null ? (nc.netInternal ?? 0) + (nc.netOverseas ?? 0) : null,
    typeCounts: counts,
    growing,
    shrinking,
  };
}
