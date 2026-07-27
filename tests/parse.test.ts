// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import { describe, expect, it } from 'vitest';
import {
  readCsv,
  parseSdmx,
  num,
  buildErpSeries,
  buildComponents,
  nationalSeriesFromComponents,
  classify,
  assemble,
  reconcile,
  national,
  round,
} from '../pipeline/parse.mjs';

describe('readCsv', () => {
  it('parses simple rows', () => {
    expect(readCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
  it('handles quoted commas', () => {
    expect(readCsv('a,b\n"x,y",2')).toEqual([
      ['a', 'b'],
      ['x,y', '2'],
    ]);
  });
  it('strips a BOM', () => {
    expect(readCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });
});

describe('num', () => {
  it('parses numbers and rejects blanks/junk', () => {
    expect(num('1234')).toBe(1234);
    expect(num('-5')).toBe(-5);
    expect(num('')).toBeNull();
    expect(num('NaN')).toBeNull();
    expect(num(null)).toBeNull();
  });
});

describe('round', () => {
  it('rounds to decimals, passes null through', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(null)).toBeNull();
  });
});

const ERP_CSV = [
  'DATAFLOW,MEASURE,SEX_ABS,AGE,LGA_2024,REGION_TYPE,FREQUENCY,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE',
  'ABS:X,ERP,3,TOT,10050,LGA2024,A,2023,1000,PSNS',
  'ABS:X,ERP,3,TOT,10050,LGA2024,A,2024,1100,PSNS',
  'ABS:X,ERP,3,TOT,20000,LGA2024,A,2023,500,PSNS',
  'ABS:X,ERP,3,TOT,20000,LGA2024,A,2024,450,PSNS',
  'ABS:X,ERP,3,TOT,1,STE,A,2024,99999,PSNS', // a state row — must be ignored
].join('\n');

// components: POP_COMP 1 births, 2 deaths, 3 natural, 6 net internal, 9 net overseas, 10 erp
function compRows(code: string, year: string, vals: Record<number, number>): string[] {
  return Object.entries(vals).map(
    ([k, v]) => `ABS:C,${k},LGA2024,${code},A,${year},${v},PSNS`,
  );
}
const COMP_HEADER = 'DATAFLOW,POP_COMP,REGION_TYPE,REGION,FREQ,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE';
const COMP_CSV = [
  COMP_HEADER,
  ...compRows('10050', '2024', { 1: 30, 2: 10, 3: 20, 6: 40, 9: 40, 10: 1100 }),
  ...compRows('20000', '2024', { 1: 5, 2: 15, 3: -10, 6: -40, 9: 5, 10: 450 }),
  'ABS:C,10,AUS,AUS,A,2024,0,PSNS',
].join('\n');

describe('buildErpSeries + assemble', () => {
  const erpMap = buildErpSeries(parseSdmx(ERP_CSV));
  const validCodes = new Set(['10050', '20000']);
  const compMap = buildComponents([{ rows: parseSdmx(COMP_CSV), regionType: 'LGA2024' }], validCodes);
  const names = new Map([
    ['10050', { name: 'Albury', state: 'New South Wales' }],
    ['20000', { name: 'Tiny Shire', state: 'Victoria' }],
  ]);
  const lgas = assemble(erpMap, compMap, names, 2024);

  it('ignores non-LGA region rows', () => {
    expect(erpMap.has('1')).toBe(false);
    expect(erpMap.size).toBe(2);
  });

  it('computes growth from the ERP series', () => {
    const albury = lgas.find((l) => l.code === '10050');
    expect(albury?.pop).toBe(1100);
    expect(albury?.change1yr).toBe(100);
    expect(albury?.growth1yr).toBeCloseTo(10, 5); // (1100-1000)/1000
  });

  it('carries the components and computes rates per 1,000', () => {
    const albury = lgas.find((l) => l.code === '10050');
    expect(albury?.natural).toBe(20);
    expect(albury?.netInternal).toBe(40);
    expect(albury?.netOverseas).toBe(40);
    expect(albury?.netMig).toBe(80);
    expect(albury?.natRate).toBe(18.18); // rounded to 2dp: (20/1100)*1000
  });

  it('classifies the four demographic types correctly', () => {
    // Albury: natural +, migration + → both
    expect(lgas.find((l) => l.code === '10050')?.type).toBe('both');
    // Tiny Shire: natural -10 (<0), netMig -40+5=-35 (<0) → emptying
    expect(lgas.find((l) => l.code === '20000')?.type).toBe('emptying');
  });
});

describe('classify', () => {
  it('assigns quadrants by the two rates', () => {
    expect(classify(5, 5)).toBe('both');
    expect(classify(5, -5)).toBe('natural');
    expect(classify(-5, 5)).toBe('migration');
    expect(classify(-5, -5)).toBe('emptying');
  });
});

describe('reconcile', () => {
  it('passes when ERP series agrees with component-10 ERP', () => {
    const erpMap = buildErpSeries(parseSdmx(ERP_CSV));
    const validCodes = new Set(['10050', '20000']);
    const compMap = buildComponents([{ rows: parseSdmx(COMP_CSV), regionType: 'LGA2024' }], validCodes);
    const names = new Map([
      ['10050', { name: 'Albury', state: 'NSW' }],
      ['20000', { name: 'Tiny', state: 'VIC' }],
    ]);
    const lgas = assemble(erpMap, compMap, names, 2024);
    // Only 2 LGAs — the gate requires ≥400, so it throws. Assert it guards.
    expect(() => reconcile(lgas, compMap, 2024)).toThrow(/only 2 LGAs/);
  });
});

describe('nationalSeriesFromComponents', () => {
  it('sums components across LGAs per year', () => {
    const compMap = buildComponents(
      [{ rows: parseSdmx(COMP_CSV), regionType: 'LGA2024' }],
      new Set(['10050', '20000']),
    );
    const ns = nationalSeriesFromComponents(compMap);
    expect(ns['2024'].natural).toBe(10); // 20 + (-10)
    expect(ns['2024'].netInternal).toBe(0); // 40 + (-40) → zero-sum
    expect(ns['2024'].netOverseas).toBe(45); // 40 + 5
  });
});

describe('national', () => {
  it('counts growing/shrinking and types', () => {
    const erpMap = buildErpSeries(parseSdmx(ERP_CSV));
    const compMap = buildComponents([{ rows: parseSdmx(COMP_CSV), regionType: 'LGA2024' }], new Set(['10050', '20000']));
    const names = new Map([
      ['10050', { name: 'Albury', state: 'NSW' }],
      ['20000', { name: 'Tiny', state: 'VIC' }],
    ]);
    const lgas = assemble(erpMap, compMap, names, 2024);
    const nat = national(lgas, nationalSeriesFromComponents(compMap), 2024);
    expect(nat.growing).toBe(1);
    expect(nat.shrinking).toBe(1);
    expect(nat.typeCounts.both).toBe(1);
    expect(nat.typeCounts.emptying).toBe(1);
  });
});
