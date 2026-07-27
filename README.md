# Population Change

**Where Australia is growing and shrinking — every council mapped and ranked, and the three engines behind it: births minus deaths, and migration in and out.**

🔗 **Live:** [https://au-population.benrichardson.dev](https://au-population.benrichardson.dev)

## What is this?

Every population headline collapses growth into a single number, which hides the mechanism. A council can grow because babies outnumber deaths (**natural increase**), because Australians move there from elsewhere in the country (**net internal migration**), or because migrants arrive from overseas (**net overseas migration**) — and across ~540 councils those three engines point in completely different directions.

This site decomposes each local government area into those three engines, ranks and maps them, and shows two decades of trajectory. The headline finding: Australia now grows overwhelmingly by overseas migration — in the latest year it added roughly four times as many people as natural increase — and net overseas migration is also the most volatile engine, collapsing below zero when the border closed in 2020–21 and rebounding to record highs afterwards. Meanwhile a booming outer-suburban corridor, an ageing coastal "sea-change" town and an emptying wheat-belt shire can all show similar headline growth for completely different reasons.

## Who is this for?

Australians curious whether their town is growing or emptying out; journalists and planners chasing the fastest-growing (and fastest-shrinking) places; demographers; and anyone weighing a move. Type your council into the search box to see its engines, its trajectory and where it ranks.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| ABS Regional Population — ERP by LGA | Estimated Resident Population per council, 2001→latest | Annual |
| ABS Regional Population — components of change | Births, deaths, net internal migration, net overseas migration per council | Annual |
| ABS ASGS 2024 LGA boundaries | Real council polygons for the map | Static |

## Features

- **Growth-engines decomposition** — every council split into natural increase, net internal and net overseas migration.
- **Quadrant classifier** — a scatter of natural-increase rate vs net-migration rate that sorts councils into four demographic types.
- **Leaflet choropleth** — growth rate, population and each engine's per-capita rate, with a per-council drawer.
- **Rankings** — fastest growing/shrinking (rate and absolute) and by each engine, against the national median.
- **Trends** — the three engines over time (with the COVID border-closure collapse) and 20+ years of population by state.
- **Population treemap** — every council sized by population, coloured by growth.
- **States matrix** — which states grow by which engine (net internal migration is zero-sum nationally).
- **Explorer** — search, filter and sort all councils, with population sparklines, engine mini-bars and a click-through histogram.
- **Auto-detected insights** and a hash-linkable per-council drill-down (`#lga=10050`).

## Tech Stack

- **Runtime:** Vanilla TypeScript
- **Build:** Vite 6
- **Testing:** Vitest (parser + reconciliation, positional layout, analysis, and a headless render smoke test)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** annual GitHub Actions pipeline (dependency-free parser; mapshaper only to simplify boundaries)
- **Map:** Leaflet

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

Rebuild the data (fetches ABS ERP + components + LGA boundaries, simplifies with mapshaper, writes `public/data/`):

```bash
cd pipeline && npm install && node collect.mjs && node aggregate.mjs
```

## How it works

An annual GitHub Actions pipeline pulls the ABS Regional Population series (ERP and components of change) via the ABS SDMX API and the LGA boundaries from the ABS ArcGIS service, joins them, and writes `population.json` plus a simplified `lga.geojson`. A hard reconciliation gate fails the build unless two independent ABS series agree (the long ERP series matches the component-file ERP for every council) and net internal migration sums to zero nationally. The browser loads those static files — no backend, no runtime API calls.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Data sources keep theirs, and their attribution requirements are listed in the site's
own methodology/sources section.
