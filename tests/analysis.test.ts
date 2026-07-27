// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import { describe, expect, it } from 'vitest';
import { median, rankable, ranked, metricByKey, insights } from '../src/analysis';
import { growthColour } from '../src/colors';
import type { Lga, Payload } from '../src/types';

function lga(partial: Partial<Lga>): Lga {
  return {
    code: '1',
    name: 'X',
    state: 'New South Wales',
    pop: 10000,
    series: { 2020: 9000, 2024: 10000 },
    growth1yr: 1,
    change1yr: 100,
    growth5yr: 5,
    growth10yr: 10,
    growthAll: 20,
    firstYear: 2001,
    births: 100,
    deaths: 60,
    natural: 40,
    netInternal: 10,
    netOverseas: 50,
    netMig: 60,
    totalChange: 100,
    natRate: 4,
    netInternalRate: 1,
    netOverseasRate: 5,
    netMigRate: 6,
    type: 'both',
    compSeries: {},
    ...partial,
  };
}

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('rankable + ranked', () => {
  const lgas = [
    lga({ code: 'a', pop: 100, growth1yr: 99 }), // below floor
    lga({ code: 'b', pop: 10000, growth1yr: 3 }),
    lga({ code: 'c', pop: 10000, growth1yr: 5 }),
    lga({ code: 'd', pop: 10000, growth1yr: null }),
  ];
  it('drops sub-floor LGAs from rate metrics', () => {
    const r = ranked(lgas, metricByKey('growth1yr'), 'desc');
    expect(r.map((l) => l.code)).toEqual(['c', 'b']); // a below floor, d null
  });
  it('rankable applies a population floor', () => {
    expect(rankable(lgas, 3000).map((l) => l.code)).toEqual(['b', 'c', 'd']);
  });
  it('sorts ascending when asked', () => {
    expect(ranked(lgas, metricByKey('growth1yr'), 'asc')[0].code).toBe('b');
  });
});

describe('growthColour', () => {
  it('is neutral for null, red for decline, teal for growth', () => {
    expect(growthColour(null)).toBe('#eef2f6');
    expect(growthColour(-2)).not.toBe(growthColour(2));
    // deep decline trends toward red channel dominance
    const red = growthColour(-10, -2, 6);
    expect(parseInt(red.slice(1, 3), 16)).toBeGreaterThan(parseInt(red.slice(5, 7), 16));
  });
});

describe('insights', () => {
  const payload: Payload = {
    meta: { source: 's', referenceYear: 2024, firstYear: 2001, compFirstYear: 2017, lgaCount: 3, generatedFrom: 'x', componentLabels: {} },
    national: {
      latestYear: 2024,
      totalPop: 30000,
      births: 300,
      deaths: 180,
      natural: 120,
      netInternal: 0,
      netOverseas: 480,
      netMig: 480,
      typeCounts: { both: 1, natural: 0, migration: 1, emptying: 1 },
      growing: 2,
      shrinking: 1,
    },
    natComp: {
      2020: { natural: 130, netInternal: 0, netOverseas: 190 },
      2021: { natural: 130, netInternal: 0, netOverseas: -88 },
      2023: { natural: 100, netInternal: 0, netOverseas: 535 },
      2024: { natural: 120, netInternal: 0, netOverseas: 480 },
    },
    natSeries: { 2001: 20000, 2024: 30000 },
    stateAgg: [
      { state: 'New South Wales', pop: 20000, births: 0, deaths: 0, natural: 0, netInternal: -50, netOverseas: 0, netMig: -50, totalChange: -50, lgaCount: 1, natRate: 0, netInternalRate: -2.5, netOverseasRate: 0 },
      { state: 'Queensland', pop: 10000, births: 0, deaths: 0, natural: 0, netInternal: 50, netOverseas: 0, netMig: 50, totalChange: 50, lgaCount: 1, natRate: 0, netInternalRate: 5, netOverseasRate: 0 },
    ],
    lgas: [
      lga({ code: 'a', name: 'Boomtown', state: 'Queensland', pop: 60000, growth1yr: 5, change1yr: 3000, type: 'both', netOverseasRate: 20, netInternalRate: 5 }),
      lga({ code: 'b', name: 'Emptyville', pop: 8000, growth1yr: -2, change1yr: -160, natural: -20, netMig: -40, netMigRate: -5, natRate: -2.5, type: 'emptying' }),
      lga({ code: 'c', name: 'Seaside', pop: 12000, growth1yr: 1, natural: -5, type: 'migration' }),
    ],
  };
  const found = insights(payload);
  it('produces multiple findings', () => {
    expect(found.length).toBeGreaterThanOrEqual(5);
  });
  it('detects overseas-migration dominance', () => {
    expect(found.some((f) => /overseas migration/i.test(f.title))).toBe(true);
  });
  it('detects the COVID negative-migration year', () => {
    expect(found.some((f) => /2021/.test(f.title) && /negative/i.test(f.title))).toBe(true);
  });
  it('flags an emptying council with a drill-down code', () => {
    expect(found.some((f) => f.code === 'b')).toBe(true);
  });
});
