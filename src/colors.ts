// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/**
 * The site's shared visual language. Every view references these — the same
 * colour always means the same thing (a growth engine, or growth-vs-decline).
 */

/** The three growth engines. Same colour in every bar, matrix, scatter, drawer. */
export const ENGINE = {
  natural: '#10b981', // natural increase (births − deaths) — emerald
  netInternal: '#6366f1', // net internal migration — indigo
  netOverseas: '#f59e0b', // net overseas migration — amber
} as const;
export type Engine = keyof typeof ENGINE;

export const ENGINE_LABEL: Record<Engine, string> = {
  natural: 'Natural increase',
  netInternal: 'Net internal migration',
  netOverseas: 'Net overseas migration',
};
export const ENGINE_SHORT: Record<Engine, string> = {
  natural: 'Natural',
  netInternal: 'Internal',
  netOverseas: 'Overseas',
};
export const ENGINE_ORDER: Engine[] = ['natural', 'netInternal', 'netOverseas'];

/** Births/deaths for the natural-increase breakdown. */
export const BIRTHS = '#34d399';
export const DEATHS = '#94a3b8';

/** The four demographic types (quadrant classifier). */
export const TYPE_COLOUR: Record<'both' | 'natural' | 'migration' | 'emptying', string> = {
  both: '#0d9488', // growing on both engines — teal
  natural: '#84cc16', // young but net outflow — lime
  migration: '#6366f1', // ageing but attractive — indigo
  emptying: '#dc2626', // decline on both — red
};
export const TYPE_LABEL: Record<'both' | 'natural' | 'migration' | 'emptying', string> = {
  both: 'Growing on both engines',
  natural: 'Natural growth, net outflow',
  migration: 'Migration-fed, natural decline',
  emptying: 'Emptying (decline on both)',
};
export const TYPE_BLURB: Record<'both' | 'natural' | 'migration' | 'emptying', string> = {
  both: 'More births than deaths AND more people arriving than leaving.',
  natural: 'More births than deaths, but a net loss of residents to migration.',
  migration: 'More deaths than births, kept growing by people moving in.',
  emptying: 'More deaths than births AND a net loss of residents — shrinking on both.',
};

/** State abbreviations, keyed by the full ABS name. */
export const STATE_ABBR: Record<string, string> = {
  'New South Wales': 'NSW',
  Victoria: 'VIC',
  Queensland: 'QLD',
  'South Australia': 'SA',
  'Western Australia': 'WA',
  Tasmania: 'TAS',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT',
  'Other Territories': 'OT',
};
export const STATE_COLOUR: Record<string, string> = {
  NSW: '#2563eb',
  VIC: '#7c3aed',
  QLD: '#ea580c',
  SA: '#dc2626',
  WA: '#0d9488',
  TAS: '#65a30d',
  NT: '#d97706',
  ACT: '#db2777',
  OT: '#64748b',
};
export function stateAbbr(name: string): string {
  return STATE_ABBR[name] ?? name;
}
export function stateColour(name: string): string {
  return STATE_COLOUR[stateAbbr(name)] ?? '#94a3b8';
}

/** Linear interpolation between two hex colours. t in [0,1]. */
function lerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Diverging growth ramp: decline → 0 → growth. `mid` is the neutral point
 * (usually 0). Amber/red below, teal/green above. `neg` and `pos` set the
 * saturating ends of the scale (clamped).
 */
export function growthColour(v: number | null, neg = -2, pos = 6, mid = 0): string {
  if (v == null || !Number.isFinite(v)) return '#eef2f6';
  if (v < mid) {
    const t = Math.max(0, Math.min(1, (mid - v) / (mid - neg)));
    return lerp('#f1f5f9', '#b91c1c', t); // grey → deep red
  }
  const t = Math.max(0, Math.min(1, (v - mid) / (pos - mid)));
  return lerp('#f1f5f9', '#0f766e', t); // grey → deep teal
}

/** A sequential ramp for a single non-diverging measure (0 → max). */
export function seqColour(v: number | null, max: number, base = '#0d9488'): string {
  if (v == null || !Number.isFinite(v) || max <= 0) return '#eef2f6';
  return lerp('#e8f2f1', base, Math.max(0, Math.min(1, v / max)));
}
