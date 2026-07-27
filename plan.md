# Site Plan: Population Change

## Overview
- **Name:** Population Change
- **Repo name:** au-population
- **Tagline:** Where Australia is growing and shrinking — and the four engines driving it: births, deaths, and migration in and out.

### Naming Convention
Plain topic name, no country code. Country lives in the index `country: "AU"` field (renders as a flag). "Population Change" is searchable and neutral (regions both grow and shrink).

## Target Audience
Australians curious about their town's future, journalists and planners chasing the "fastest-growing / dying towns" story, demographers, and property/relocation researchers. Mostly desktop for the dense views; the map and per-LGA drawer work on phones. They arrive asking "is my area growing or emptying out, and why?"

## Value Proposition
Every population headline collapses growth into one number, which hides the mechanism. A town can grow because babies outnumber deaths, because Australians move there, or because migrants arrive from overseas — and those three engines point in completely different directions across the country. This is the only place that decomposes each of ~540 councils into its four engines (births, deaths, net internal migration, net overseas migration), ranks and maps them, and shows 23 years of trajectory including the COVID migration shock. Bookmark-worthy: type your council, see its engines and where it ranks.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth |
|--------|-----|-------------------|-----------------|------|
| ABS Regional Population — ERP by LGA (2024) | data.api.abs.gov.au `ABS_ANNUAL_ERP_LGA2024` | Estimated Resident Population per LGA, 2001→2024 (total, all ages) | Annual (each Mar/Apr) | No |
| ABS Regional Population — Components of change by LGA | data.api.abs.gov.au `ERP_COMP_LGA2024` (+ earlier editions stitched) | Births, deaths, natural increase, net internal migration, net overseas migration per LGA | Annual | No |
| ABS ASGS 2024 LGA boundaries | geo.abs.gov.au ArcGIS `ASGS2024/LGA` (LGA_GEN) | Real LGA polygons (`lga_code_2024`,`lga_name_2024`) | Static | No |
| ABS ASGS 2021 state boundaries | patterns/geo/au-states.geojson | State overlay / context | Static | No |

## Key Features
1. **Growth-engines decomposition** — every LGA split into natural increase vs net internal vs net overseas migration (the signature idea).
2. **Quadrant classifier** — natural-increase rate vs net-migration rate scatter that sorts councils into types (booming corridor, sea-change, natural-decline, mining swing).
3. **Leaflet LGA choropleth** — growth %, population, and each engine's per-capita rate, with a per-council drawer.
4. **Rankings** — fastest growing/shrinking (rate & absolute) and by each engine.
5. **23-year trajectory** — national + per-state, annotated with the 2020–21 COVID border closure that collapsed overseas migration.
6. **Population treemap** — state→LGA, sized by population, coloured by growth rate.
7. **State × engine matrix** — which states grow by which engine.
8. **Explorer** — all LGAs, sparklines + engine mini-bars, click-through histogram.
9. **Auto-insights** + hash-linkable per-LGA drill-down (#lga=CODE).

## Style Direction
**Tone:** civic / demographic, trustworthy but not clinical. **Palette:** light, warm neutral background with a diverging growth ramp (teal = growth, warm amber/red = decline) reused identically across map, bars, treemap, scatter. **UI density:** balanced (data-dense tables, generous hero). **Theme:** light. **Reference feel:** ABS Regional Population dashboards, the fleet's au-approvals/au-mortality.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite.
- **Data strategy:** pipeline — annual cron (ABS Regional Population publishes once a year; monthly-fastest rule → yearly cron, staggered day/minute). Embeds the ABS reference year, not a run timestamp.
- **Key libraries:** Leaflet (map). Everything else hand-rolled SVG from `patterns/`.

## Layout
Fixed header (title + view tabs + About/?). Main content max-width ~1600px. Panels use CSS grid; stack < 768px. Sticky footer with attribution + directory backlink. Per-LGA drawer slides from the right (detached from DOM when closed).

## Visualization Strategy
- **Overview** — national engine breakdown + hero stats + top-movers preview. *Q: is Australia growing, and how?*
- **Growth Engines (signature)** — per-region component stacked bars + the natural-vs-migration quadrant scatter (zoom/pan). *Q: what drives each place?*
- **Map** — Leaflet choropleth, 5 measures, ratio/skew-aware ramp. *Q: where?*
- **Rankings** — leaderboards vs national median, by metric & engine. *Q: who's top/bottom?*
- **Trends** — 23-yr multi-line + components-over-time stacked area, COVID annotation. *Q: how did it change?*
- **Treemap** — population composition coloured by growth. *Q: big picture?*
- **Matrix** — state × engine per-capita heatmap. *Q: which state grows by which engine?*
- **Explorer** — sortable table + sparklines + histogram. *Q: look up any council.*
- **Insights** — auto anomalies (natural decline, migration dependence, COVID rebound). *Q: what stands out?*

Every mark gets a `[data-tip]` hover tooltip; dense SVGs get zoom/pan; force/treemap layouts pre-settled; per-view UX critique recorded in the build log.
