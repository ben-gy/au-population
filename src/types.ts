// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

/** One of the four demographic types a single growth number hides. */
export type LgaType = 'both' | 'natural' | 'migration' | 'emptying' | null;

export interface Lga {
  code: string;
  name: string;
  state: string;
  pop: number | null;
  series: Record<string, number>; // year → ERP, 2001→latest
  growth1yr: number | null; // % over the latest year
  change1yr: number | null; // absolute persons over the latest year
  growth5yr: number | null;
  growth10yr: number | null;
  growthAll: number | null; // % since firstYear
  firstYear: number;
  // components of change (latest year), raw counts
  births: number | null;
  deaths: number | null;
  natural: number | null; // births − deaths
  netInternal: number | null; // net internal migration
  netOverseas: number | null; // net overseas migration
  netMig: number | null; // netInternal + netOverseas
  totalChange: number | null; // natural + netMig
  // per 1,000 residents
  natRate: number | null;
  netInternalRate: number | null;
  netOverseasRate: number | null;
  netMigRate: number | null;
  type: LgaType;
  compSeries: Record<string, ComponentYear>; // year → components, 2017→latest
}

export interface ComponentYear {
  births?: number;
  deaths?: number;
  natural?: number;
  internalArrivals?: number;
  internalDepartures?: number;
  netInternal?: number;
  overseasArrivals?: number;
  overseasDepartures?: number;
  netOverseas?: number;
  erp?: number;
}

export interface National {
  latestYear: number;
  totalPop: number;
  births: number | null;
  deaths: number | null;
  natural: number | null;
  netInternal: number | null;
  netOverseas: number | null;
  netMig: number | null;
  typeCounts: Record<'both' | 'natural' | 'migration' | 'emptying', number>;
  growing: number;
  shrinking: number;
}

export interface StateAgg {
  state: string;
  pop: number;
  births: number;
  deaths: number;
  natural: number;
  netInternal: number;
  netOverseas: number;
  netMig: number;
  totalChange: number;
  lgaCount: number;
  natRate: number;
  netInternalRate: number;
  netOverseasRate: number;
}

export interface Meta {
  source: string;
  referenceYear: number;
  firstYear: number;
  compFirstYear: number;
  lgaCount: number;
  generatedFrom: string;
  componentLabels: Record<string, string>;
}

export interface Payload {
  meta: Meta;
  national: National;
  natComp: Record<string, Record<string, number>>;
  natSeries: Record<string, number>;
  stateAgg: StateAgg[];
  lgas: Lga[];
}

export type ViewId =
  | 'overview'
  | 'engines'
  | 'map'
  | 'rankings'
  | 'trends'
  | 'treemap'
  | 'matrix'
  | 'explorer'
  | 'insights';
