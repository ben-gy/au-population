# Population Change — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/au-population/ *(redirects to custom domain once DNS is set)*
- **Custom domain:** https://au-population.benrichardson.dev

## What it is

Every Australian council (LGA) mapped and ranked by population change, decomposed into the three
engines behind it: natural increase (births − deaths), net internal migration, and net overseas
migration. Nine views: Overview, Growth Engines (signature quadrant scatter), Map, Rankings, Trends,
Treemap, States matrix, Explorer, Insights — plus a hash-linkable per-council drawer (`#lga=10050`).

## Data

- **ABS Regional Population** — Estimated Resident Population by LGA (2001→2024) and components of
  population change (births, deaths, net internal & overseas migration), via the ABS SDMX API.
- **ABS ASGS 2024** LGA boundaries (ArcGIS, mapshaper-simplified).

Annual pipeline. A hard reconciliation gate fails the build unless two independent ABS series agree
(long ERP series == component-file ERP per council) and net internal migration sums to zero nationally.

## Verification

- `npm test` — 46 tests pass (parser + reconciliation, positional layout, analysis, and a headless
  render smoke test that renders every content view + every drawer against the REAL built data with
  zero NaN/undefined/errors).
- `npm run build` — clean.
- Data endpoints serve 200 locally (`population.json`, `lga.geojson`).
- Full in-browser click-through on the live URL could not be run in the build environment (the
  Browser pane blocks localhost/benrichardson.dev by policy and Claude-in-Chrome was not connected);
  the headless render test against the byte-identical built data covers the render path.
