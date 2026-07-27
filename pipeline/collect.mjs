// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/**
 * collect.mjs — download every upstream source into pipeline/.cache/.
 *
 * Sources (all public, no auth, ABS):
 *   1. ABS_ANNUAL_ERP_LGA2024 — Estimated Resident Population per LGA, 2001→2024
 *      (SDMX-CSV; MEASURE=ERP, SEX=3 persons, AGE=TOT all ages, LGA region type).
 *   2. ERP_COMP_LGA2024 (2022-2024) + ERP_COMP_LGA2021 (2017-2021) — components
 *      of population change (births, deaths, net internal & overseas migration).
 *   3. ABS ASGS 2024 LGA boundaries — real polygons from the ArcGIS LGA_GEN
 *      layer (generalised), paged. Never hand-authored.
 *
 * Downloads are cached; re-runs only re-fetch what's missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');
fs.mkdirSync(CACHE, { recursive: true });

const API = 'https://data.api.abs.gov.au/rest/data';
const ERP = `${API}/ABS_ANNUAL_ERP_LGA2024/ERP.3.TOT..LGA2024.A?format=csv`;
const COMP2024 = `${API}/ERP_COMP_LGA2024/all?format=csv`;
const COMP2021 = `${API}/ERP_COMP_LGA2021/all?format=csv`;
const LGA_GEO = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2024/LGA/MapServer/1/query';

// ABS SDMX and the ArcGIS server both tarpit bare fetch() clients.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'text/csv,application/json,*/*',
  'accept-language': 'en-AU,en;q=0.9',
};
const ATTEMPT_TIMEOUT_MS = 120_000;

function log(m) {
  process.stdout.write(`[collect] ${m}\n`);
}

async function fetchText(url) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      const wait = 4000 * 2 ** i;
      log(`  retry ${i + 1}/4 in ${wait}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function cacheCsv(name, url, minBytes) {
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    log(`cached  ${name}`);
    return dest;
  }
  log(`fetch   ${name}`);
  const text = await fetchText(url);
  if (text.length < minBytes) throw new Error(`${name}: got only ${text.length} bytes — source moved?`);
  fs.writeFileSync(dest, text);
  return dest;
}

async function fetchLgaGeo() {
  const dest = path.join(CACHE, 'lga-raw.geojson');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2_000_000) {
    log('cached  lga-raw.geojson');
    return dest;
  }
  const feats = [];
  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const url =
      `${LGA_GEO}?where=1%3D1&outFields=lga_code_2024,lga_name_2024,state_name_2021` +
      `&outSR=4326&resultRecordCount=${pageSize}&resultOffset=${offset}&f=geojson`;
    log(`fetch   LGA polygons offset ${offset}`);
    const gj = JSON.parse(await fetchText(url));
    const got = gj.features ?? [];
    feats.push(...got);
    if (got.length < pageSize) break;
  }
  if (feats.length < 500) throw new Error(`only ${feats.length} LGA polygons — expected ~547`);
  fs.writeFileSync(dest, JSON.stringify({ type: 'FeatureCollection', features: feats }));
  log(`wrote   lga-raw.geojson (${feats.length} polygons)`);
  return dest;
}

async function main() {
  await cacheCsv('erp.csv', ERP, 200_000);
  await cacheCsv('comp2024.csv', COMP2024, 500_000);
  await cacheCsv('comp2021.csv', COMP2021, 500_000);
  await fetchLgaGeo();
  log('done.');
}

main().catch((err) => {
  console.error('[collect] FATAL', err);
  process.exit(1);
});
