// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/** Pure analysis helpers: rankings, medians, and auto-detected insights. */
import type { Lga, Payload } from './types';
import { ENGINE_LABEL, stateAbbr } from './colors';

export function median(nums: number[]): number {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** LGAs big enough to rank reliably on rates (avoids tiny-denominator noise). */
export function rankable(lgas: Lga[], minPop = 3000): Lga[] {
  return lgas.filter((l) => (l.pop ?? 0) >= minPop);
}

export interface RankMetric {
  key: string;
  label: string;
  unit: 'pct' | 'num' | 'rate';
  get: (l: Lga) => number | null;
  minPop: number;
  desc: string;
}

export const METRICS: RankMetric[] = [
  { key: 'growth1yr', label: 'Growth rate (1 yr)', unit: 'pct', get: (l) => l.growth1yr, minPop: 3000, desc: 'Percent change in population over the latest year.' },
  { key: 'change1yr', label: 'Population added (1 yr)', unit: 'num', get: (l) => l.change1yr, minPop: 0, desc: 'Number of extra residents over the latest year.' },
  { key: 'growth5yr', label: 'Growth rate (5 yr)', unit: 'pct', get: (l) => l.growth5yr, minPop: 3000, desc: 'Percent change over the last five years.' },
  { key: 'natRate', label: 'Natural increase rate', unit: 'rate', get: (l) => l.natRate, minPop: 3000, desc: 'Births minus deaths per 1,000 residents.' },
  { key: 'netInternalRate', label: 'Net internal migration rate', unit: 'rate', get: (l) => l.netInternalRate, minPop: 3000, desc: 'Net gain/loss of residents from within Australia, per 1,000.' },
  { key: 'netOverseasRate', label: 'Net overseas migration rate', unit: 'rate', get: (l) => l.netOverseasRate, minPop: 3000, desc: 'Net gain from overseas migration per 1,000 residents.' },
  { key: 'pop', label: 'Population', unit: 'num', get: (l) => l.pop, minPop: 0, desc: 'Estimated resident population.' },
];

export function metricByKey(key: string): RankMetric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export function ranked(lgas: Lga[], m: RankMetric, dir: 'desc' | 'asc' = 'desc'): Lga[] {
  const pool = lgas.filter((l) => (l.pop ?? 0) >= m.minPop && m.get(l) != null);
  return pool.sort((a, b) => {
    const va = m.get(a) as number;
    const vb = m.get(b) as number;
    return dir === 'desc' ? vb - va : va - vb;
  });
}

export interface Insight {
  severity: 'info' | 'warn' | 'alert';
  title: string;
  body: string;
  code?: string; // link to an LGA drawer
}

/** Auto-detected findings. Pure over the dataset. */
export function insights(data: Payload): Insight[] {
  const out: Insight[] = [];
  const { national: n, natComp } = data;
  const big = rankable(data.lgas, 5000);

  // 1. The overseas-migration dominance.
  if (n.natural != null && n.netOverseas != null && n.natural > 0) {
    const ratio = n.netOverseas / n.natural;
    out.push({
      severity: 'info',
      title: 'Australia now grows mostly by overseas migration',
      body: `In ${n.latestYear}, net overseas migration added ${fmt(n.netOverseas)} people — ${ratio.toFixed(1)}× the ${fmt(n.natural)} added by natural increase (births minus deaths). Migration, not babies, is the main engine of national growth.`,
    });
  }

  // 2. The COVID collapse & rebound in overseas migration.
  const years = Object.keys(natComp).map(Number).sort((a, b) => a - b);
  const osByYear = Object.fromEntries(years.map((y) => [y, natComp[y]?.netOverseas ?? null]));
  const trough = years.filter((y) => osByYear[y] != null).reduce((lo, y) => (osByYear[y]! < (osByYear[lo] ?? Infinity) ? y : lo), years[0]);
  if (osByYear[trough] != null && osByYear[trough]! < 0) {
    const peak = years.reduce((hi, y) => ((osByYear[y] ?? -Infinity) > (osByYear[hi] ?? -Infinity) ? y : hi), years[0]);
    out.push({
      severity: 'warn',
      title: `Closed borders drove net overseas migration negative in ${trough}`,
      body: `Net overseas migration fell to ${fmt(osByYear[trough]!)} in ${trough} — more people left than arrived, the first net loss on record — then rebounded to a record ${fmt(osByYear[peak]!)} in ${peak} as borders reopened.`,
    });
  }

  // 3. Fastest shrinking (emptying) LGA.
  const emptying = big.filter((l) => l.type === 'emptying' && l.growth1yr != null).sort((a, b) => (a.growth1yr as number) - (b.growth1yr as number));
  if (emptying[0]) {
    const l = emptying[0];
    out.push({
      severity: 'alert',
      title: `${l.name} is emptying on both engines`,
      body: `${l.name} (${stateAbbr(l.state)}) shrank ${Math.abs(l.growth1yr as number).toFixed(2)}% in the latest year — more deaths than births (${l.natRate?.toFixed(1)}/1,000) and a net loss of residents (${l.netMigRate?.toFixed(1)}/1,000).`,
      code: l.code,
    });
  }

  // 4. Most migration-dependent big city (highest overseas rate).
  const osTop = ranked(big.filter((l) => (l.pop ?? 0) >= 50000), metricByKey('netOverseasRate'))[0];
  if (osTop) {
    out.push({
      severity: 'info',
      title: `${osTop.name} grows almost entirely on overseas arrivals`,
      body: `${osTop.name} gained ${osTop.netOverseasRate?.toFixed(1)} residents per 1,000 from overseas migration — while its net internal migration was ${osTop.netInternalRate?.toFixed(1)}/1,000. Inner cities fill with new arrivals as existing residents move out.`,
      code: osTop.code,
    });
  }

  // 5. The Sydney→Brisbane internal drift, framed at state level.
  const st = Object.fromEntries(data.stateAgg.map((s) => [stateAbbr(s.state), s]));
  if (st.NSW && st.QLD && st.NSW.netInternal < 0 && st.QLD.netInternal > 0) {
    out.push({
      severity: 'info',
      title: 'New South Wales keeps losing people to Queensland',
      body: `NSW had a net internal migration loss of ${fmt(-st.NSW.netInternal)} in ${n.latestYear}, while Queensland gained ${fmt(st.QLD.netInternal)} — the long-running drift up the coast. Net internal migration is zero-sum: one state's gain is another's loss.`,
    });
  }

  // 6. How many councils are shrinking.
  out.push({
    severity: n.shrinking > 0 ? 'warn' : 'info',
    title: `${n.shrinking} of ${data.lgas.length} councils lost population`,
    body: `${n.growing} local government areas grew over the latest year and ${n.shrinking} shrank. ${n.typeCounts.migration} are "migration-fed" — kept growing only because people move in, even as deaths outnumber births.`,
  });

  // 7. Biggest absolute gainer.
  const gainer = ranked(data.lgas, metricByKey('change1yr'))[0];
  if (gainer) {
    out.push({
      severity: 'info',
      title: `${gainer.name} added the most people`,
      body: `${gainer.name} (${stateAbbr(gainer.state)}) grew by ${fmt(gainer.change1yr!)} residents in a single year — more than any other council — to ${fmt(gainer.pop!)}.`,
      code: gainer.code,
    });
  }

  // 8. Natural decline is widespread.
  const natNeg = data.lgas.filter((l) => l.natural != null && l.natural < 0).length;
  out.push({
    severity: 'info',
    title: `${natNeg} councils now record more deaths than births`,
    body: `In ${natNeg} of ${data.lgas.length} local government areas, deaths outnumbered births in ${n.latestYear}. An ageing population means many places would shrink without migration.`,
  });

  return out;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-AU');
}

export { ENGINE_LABEL };
