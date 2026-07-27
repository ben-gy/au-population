// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import { ENGINE, ENGINE_LABEL, ENGINE_ORDER, stateColour, stateAbbr } from '../colors';
import { glossaryTerm } from '../glossary';
import { svg } from '../components/charts';
import { escapeHtml, formatNumber } from '../utils/format';

export function renderTrends(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>The three engines over time</h2>
        <p>National ${glossaryTerm('natural', 'natural increase')}, ${glossaryTerm('internal', 'net internal migration')} (always ~0) and
        ${glossaryTerm('overseas', 'net overseas migration')}, ${data.meta.compFirstYear}–${data.national.latestYear}. Watch overseas migration collapse when the border closed.</p>
      </div>
      <div class="legend">${ENGINE_ORDER.map((e) => `<span class="legend-item"><span class="legend-swatch" style="background:${ENGINE[e]}"></span>${ENGINE_LABEL[e]}</span>`).join('')}</div>
      <div class="chart-scroll" data-role="components"></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Population, ${data.meta.firstYear}–${data.national.latestYear}</h2><p>Total resident population by state.</p></div>
      <div class="legend" data-role="state-legend"></div>
      <div class="chart-scroll" data-role="statelines"></div>
    </section>
  `;

  (root.querySelector('[data-role="components"]') as HTMLElement).appendChild(componentsChart(data));
  const statesEl = root.querySelector('[data-role="statelines"]') as HTMLElement;
  const { chart, legend } = stateLines(data, (code) => ctx.openLga(code));
  statesEl.appendChild(chart);
  (root.querySelector('[data-role="state-legend"]') as HTMLElement).innerHTML = legend;
}

function componentsChart(data: ViewContext['data']): SVGElement {
  const W = 940;
  const H = 380;
  const M = { l: 64, r: 16, t: 20, b: 40 };
  const years = Object.keys(data.natComp).map(Number).sort((a, b) => a - b);
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const series = ENGINE_ORDER.map((e) => years.map((y) => (data.natComp[y]?.[e] ?? 0)));
  const allVals = series.flat();
  const yMax = Math.max(...allVals, 0);
  const yMin = Math.min(...allVals, 0);
  const sx = (i: number) => M.l + (i / (years.length - 1)) * iw;
  const sy = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linechart', width: W, height: H });

  // gridlines + y labels
  const ticks = niceTicks(yMin, yMax, 6);
  for (const t of ticks) {
    const y = sy(t);
    el.append(svg('line', { x1: M.l, y1: y, x2: M.l + iw, y2: y, stroke: t === 0 ? '#94a3b8' : '#eef2f6', 'stroke-width': t === 0 ? '1.2' : '1' }));
    const lab = svg('text', { x: M.l - 8, y: y + 3, 'text-anchor': 'end', class: 'axis-tick' });
    lab.textContent = compact(t);
    el.append(lab);
  }
  // x labels
  years.forEach((yr, i) => {
    if (i % 1 === 0) {
      const t = svg('text', { x: sx(i), y: H - M.b + 16, 'text-anchor': 'middle', class: 'axis-tick' });
      t.textContent = String(yr);
      el.append(t);
    }
  });

  // COVID annotation band (2020-2021)
  const iC0 = years.indexOf(2020);
  const iC1 = years.indexOf(2021);
  if (iC0 >= 0 && iC1 >= 0) {
    el.append(svg('rect', { x: sx(iC0), y: M.t, width: sx(iC1) - sx(iC0), height: ih, fill: '#64748b', 'fill-opacity': '0.07' }));
    const lab = svg('text', { x: (sx(iC0) + sx(iC1)) / 2, y: M.t + 12, 'text-anchor': 'middle', class: 'annot' });
    lab.textContent = 'Border closed';
    el.append(lab);
  }

  // lines
  series.forEach((vals, si) => {
    const e = ENGINE_ORDER[si];
    const pts = vals.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    el.append(svg('polyline', { points: pts, fill: 'none', stroke: ENGINE[e], 'stroke-width': '2.4', 'stroke-linejoin': 'round' }));
    vals.forEach((v, i) => {
      el.append(svg('circle', { cx: sx(i), cy: sy(v), r: '3.2', fill: ENGINE[e], stroke: '#fff', 'stroke-width': '1', 'data-tip': `${ENGINE_LABEL[e]}, ${years[i]}: ${v >= 0 ? '+' : ''}${formatNumber(v)}` }));
    });
  });
  return el;
}

function stateLines(data: ViewContext['data'], _onSelect: (code: string) => void): { chart: SVGElement; legend: string } {
  const W = 940;
  const H = 380;
  const M = { l: 64, r: 16, t: 16, b: 40 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  // build per-state population series by summing LGA series
  const states = [...new Set(data.lgas.map((l) => l.state))].filter(Boolean);
  const byState: Record<string, Record<number, number>> = {};
  for (const l of data.lgas) {
    if (!l.state) continue;
    byState[l.state] ||= {};
    for (const [y, p] of Object.entries(l.series)) byState[l.state][Number(y)] = (byState[l.state][Number(y)] ?? 0) + p;
  }
  const years = Object.keys(data.natSeries).map(Number).sort((a, b) => a - b);
  const ordered = states.sort((a, b) => (byState[b][years[years.length - 1]] ?? 0) - (byState[a][years[years.length - 1]] ?? 0));
  const yMax = Math.max(...ordered.map((s) => Math.max(...years.map((y) => byState[s][y] ?? 0))));
  const sx = (i: number) => M.l + (i / (years.length - 1)) * iw;
  const sy = (v: number) => M.t + (1 - v / yMax) * ih;
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linechart', width: W, height: H });

  for (const t of niceTicks(0, yMax, 6)) {
    const y = sy(t);
    el.append(svg('line', { x1: M.l, y1: y, x2: M.l + iw, y2: y, stroke: '#eef2f6', 'stroke-width': '1' }));
    const lab = svg('text', { x: M.l - 8, y: y + 3, 'text-anchor': 'end', class: 'axis-tick' });
    lab.textContent = compact(t);
    el.append(lab);
  }
  years.forEach((yr, i) => {
    if ((yr - years[0]) % 4 === 0 || i === years.length - 1) {
      const t = svg('text', { x: sx(i), y: H - M.b + 16, 'text-anchor': 'middle', class: 'axis-tick' });
      t.textContent = String(yr);
      el.append(t);
    }
  });
  for (const s of ordered) {
    const pts = years.map((y, i) => `${sx(i).toFixed(1)},${sy(byState[s][y] ?? 0).toFixed(1)}`).join(' ');
    el.append(svg('polyline', { points: pts, fill: 'none', stroke: stateColour(s), 'stroke-width': '2.2', 'stroke-linejoin': 'round', 'data-tip': `${stateAbbr(s)}: ${formatNumber(byState[s][years[years.length - 1]] ?? 0)} in ${years[years.length - 1]}` }));
  }
  const legend = ordered.map((s) => `<span class="legend-item"><span class="legend-swatch" style="background:${stateColour(s)}"></span>${escapeHtml(stateAbbr(s))}</span>`).join('');
  return { chart: el, legend };
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (range / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mult;
  const start = Math.ceil(min / s) * s;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += s) out.push(Math.round(v));
  if (min < 0 && !out.includes(0)) out.push(0);
  return out;
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}
