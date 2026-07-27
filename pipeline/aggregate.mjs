// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/**
 * aggregate.mjs — turn the cached ABS sources into the shipped JSON + geojson.
 *
 * Writes public/data/:
 *   population.json  — { meta, national, natComp, lgas[], stateAgg }
 *   lga.geojson      — simplified LGA_GEN polygons (mapshaper), joined codes only
 *
 * All parsing / maths live in parse.mjs (dependency-free, unit-tested). This
 * file only does IO + mapshaper + reconciliation gating.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSdmx,
  buildErpSeries,
  buildComponents,
  nationalComponents,
  nationalSeriesFromComponents,
  assemble,
  reconcile,
  national,
  round,
  COMP,
} from './parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const LATEST_YEAR = 2024;

function log(m) {
  process.stdout.write(`[aggregate] ${m}\n`);
}
const read = (f) => fs.readFileSync(path.join(CACHE, f), 'utf8');

function main() {
  // ── boundaries: names + valid code set ──────────────────────────────────
  const rawGeo = JSON.parse(read('lga-raw.geojson'));
  const names = new Map();
  for (const f of rawGeo.features) {
    const p = f.properties || {};
    const code = String(p.lga_code_2024 ?? '');
    if (!code) continue;
    names.set(code, { name: p.lga_name_2024 || code, state: p.state_name_2021 || '' });
  }
  const validCodes = new Set(names.keys());
  log(`${validCodes.size} LGA boundaries`);

  // ── population + components ──────────────────────────────────────────────
  const erpRows = parseSdmx(read('erp.csv'));
  const comp24 = parseSdmx(read('comp2024.csv'));
  const comp21 = parseSdmx(read('comp2021.csv'));

  const erpMap = buildErpSeries(erpRows);
  const compMap = buildComponents(
    [
      { rows: comp21, regionType: 'LGA2021' }, // 2017-2021 (earlier, overwritten where they overlap)
      { rows: comp24, regionType: 'LGA2024' }, // 2022-2024 (authoritative)
    ],
    validCodes,
  );
  const lgas = assemble(erpMap, compMap, names, LATEST_YEAR);
  log(`${lgas.length} LGAs assembled`);

  // National components 2017→latest by summing the kept LGAs (the AUS row only
  // exists for 2022-2024). Cross-check the summed latest year against the
  // published AUS row so the sum can't silently drift.
  const natComp = nationalSeriesFromComponents(compMap);
  const natCompAus = nationalComponents(comp24);
  const aus = natCompAus[LATEST_YEAR];
  if (aus?.netOverseas != null) {
    const summed = natComp[LATEST_YEAR]?.netOverseas ?? 0;
    if (Math.abs(summed - aus.netOverseas) > Math.abs(aus.netOverseas) * 0.01)
      throw new Error(
        `summed net overseas ${summed} disagrees with published AUS ${aus.netOverseas}`,
      );
  }

  // ── HARD reconciliation gate ────────────────────────────────────────────
  const recon = reconcile(lgas, compMap, LATEST_YEAR);
  log(
    `reconcile OK — ERP cross-check ${recon.erpChecked} LGAs, ${recon.erpMismatched} mismatched; ` +
      `net-internal national residual ${recon.netInternalResidual}`,
  );

  const nat = national(lgas, natComp, LATEST_YEAR);

  // per-state aggregation (engine composition by state)
  const stateMap = new Map();
  for (const l of lgas) {
    if (!l.state) continue;
    if (!stateMap.has(l.state))
      stateMap.set(l.state, {
        state: l.state,
        pop: 0,
        births: 0,
        deaths: 0,
        natural: 0,
        netInternal: 0,
        netOverseas: 0,
        lgaCount: 0,
      });
    const s = stateMap.get(l.state);
    s.pop += l.pop ?? 0;
    s.births += l.births ?? 0;
    s.deaths += l.deaths ?? 0;
    s.natural += l.natural ?? 0;
    s.netInternal += l.netInternal ?? 0;
    s.netOverseas += l.netOverseas ?? 0;
    s.lgaCount++;
  }
  const stateAgg = [...stateMap.values()]
    .map((s) => ({
      ...s,
      netMig: s.netInternal + s.netOverseas,
      totalChange: s.natural + s.netInternal + s.netOverseas,
      natRate: round((s.natural / s.pop) * 1000, 2),
      netInternalRate: round((s.netInternal / s.pop) * 1000, 2),
      netOverseasRate: round((s.netOverseas / s.pop) * 1000, 2),
    }))
    .sort((a, b) => b.pop - a.pop);

  // national population series (sum of LGA series per year) for the trend view
  const natSeries = {};
  for (const l of lgas) {
    for (const [y, p] of Object.entries(l.series)) {
      natSeries[y] = (natSeries[y] ?? 0) + p;
    }
  }

  // ── write JSON ──────────────────────────────────────────────────────────
  const payload = {
    meta: {
      source: 'ABS Regional Population (ERP + components of change) by LGA (2024 edition)',
      referenceYear: LATEST_YEAR,
      firstYear: Math.min(...Object.keys(natSeries).map(Number)),
      compFirstYear: Math.min(...Object.keys(natComp).map(Number)),
      lgaCount: lgas.length,
      generatedFrom: 'data.api.abs.gov.au ABS_ANNUAL_ERP_LGA2024 + ERP_COMP_LGA2024/2021',
      componentLabels: COMP,
    },
    national: nat,
    natComp,
    natSeries,
    stateAgg,
    lgas,
  };
  fs.writeFileSync(path.join(OUT, 'population.json'), JSON.stringify(payload));
  log(`wrote population.json (${(fs.statSync(path.join(OUT, 'population.json')).size / 1024).toFixed(0)} KB)`);

  // ── boundaries: keep only joined LGAs, simplify with mapshaper ───────────
  const withData = new Set(lgas.map((l) => l.code));
  const kept = rawGeo.features.filter((f) => withData.has(String(f.properties?.lga_code_2024)));
  log(`${kept.length}/${rawGeo.features.length} polygons have data`);
  if (kept.length < 500) throw new Error(`only ${kept.length} polygons matched — join broken`);
  const filtered = path.join(CACHE, 'lga-matched.geojson');
  fs.writeFileSync(filtered, JSON.stringify({ type: 'FeatureCollection', features: kept }));

  const dst = path.join(OUT, 'lga.geojson');
  log('simplifying LGA boundaries with mapshaper...');
  execFileSync(
    'npx',
    [
      'mapshaper',
      filtered,
      '-simplify',
      '2%',
      'keep-shapes',
      '-filter-fields',
      'lga_code_2024,lga_name_2024',
      '-rename-fields',
      'code=lga_code_2024,name=lga_name_2024',
      '-o',
      'precision=0.0005',
      'format=geojson',
      dst,
    ],
    { stdio: 'inherit', cwd: ROOT },
  );
  const size = fs.statSync(dst).size;
  if (size < 100_000) throw new Error(`lga.geojson only ${size} bytes — not real boundary data`);
  const gj = JSON.parse(fs.readFileSync(dst, 'utf8'));
  if ((gj.features?.length ?? 0) < 500) throw new Error(`only ${gj.features?.length} polygons survived`);
  log(`wrote lga.geojson (${(size / 1024).toFixed(0)} KB, ${gj.features.length} polygons)`);
  log('done.');
}

main();
