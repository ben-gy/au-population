// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { Lga, Payload } from './types';

export interface Dataset extends Payload {
  byCode: Map<string, Lga>;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const payload = await fetchJson<Payload>('data/population.json', signal);
  const byCode = new Map(payload.lgas.map((l) => [l.code, l]));
  return { ...payload, byCode };
}

let geoPromise: Promise<GeoJSON.FeatureCollection> | null = null;
export function loadGeo(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  if (!geoPromise) {
    geoPromise = fetchJson<GeoJSON.FeatureCollection>('data/lga.geojson', signal).catch((err) => {
      geoPromise = null;
      throw err;
    });
  }
  return geoPromise;
}

/** Search LGAs by name (or code). */
export function searchLgas(all: Lga[], query: string, limit = 8): Lga[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ l: Lga; score: number }> = [];
  for (const l of all) {
    const name = l.name.toLowerCase();
    let score = -1;
    if (l.code === q) score = 100;
    else if (name === q) score = 95;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 45;
    if (score > 0) scored.push({ l, score: score + Math.min(l.pop ?? 0, 1e6) / 1e8 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.l);
}
