// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import type { Lga } from '../types';
import { ENGINE, ENGINE_LABEL, ENGINE_ORDER, TYPE_COLOUR, TYPE_LABEL, stateAbbr } from '../colors';
import { rankable } from '../analysis';
import { glossaryTerm } from '../glossary';
import { svg } from '../components/charts';
import { attachSvgZoom } from '../components/svgZoom';
import { escapeHtml, formatNumber } from '../utils/format';

const W = 900;
const H = 620;
const M = { l: 64, r: 24, t: 28, b: 56 };

export function renderEngines(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const pool = rankable(data.lgas, 3000).filter((l) => l.natRate != null && l.netMigRate != null);

  // symmetric-ish domains with padding, clamped so a couple of outliers don't flatten it
  const xVals = pool.map((l) => l.natRate as number);
  const yVals = pool.map((l) => l.netMigRate as number);
  const xMin = Math.min(-4, quantile(xVals, 0.01));
  const xMax = Math.max(14, quantile(xVals, 0.99));
  const yMin = Math.min(-20, quantile(yVals, 0.01));
  const yMax = Math.max(30, quantile(yVals, 0.99));

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h2>The growth engines</h2>
        <p>
          Every council placed by two ${glossaryTerm('rate', 'rates')}: ${glossaryTerm('natural', 'natural increase')}
          (horizontal — births vs deaths) against net migration (vertical — ${glossaryTerm('internal', 'internal')} +
          ${glossaryTerm('overseas', 'overseas')}). The quadrant a place sits in <em>is</em> the story a single growth number hides.
        </p>
      </div>
      <div class="controls">
        <label>State
          <select data-role="state">
            <option value="">All states</option>
            ${[...new Set(data.lgas.map((l) => l.state))].filter(Boolean).sort().map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(stateAbbr(s))}</option>`).join('')}
          </select>
        </label>
        <div class="type-legend inline">
          ${(['both', 'natural', 'migration', 'emptying'] as const).map((t) => `<span class="type-leg"><span class="dot" style="background:${TYPE_COLOUR[t]}"></span>${TYPE_LABEL[t]}</span>`).join('')}
        </div>
      </div>
      <div class="scatter-wrap" data-role="scatter"></div>
      <p class="chart-foot">Dot size ∝ population. Councils under 3,000 residents are omitted to keep rates meaningful. Hover for detail; click to open a council.</p>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Biggest movers, decomposed</h2><p>The fastest-growing and fastest-shrinking councils, split into the three engines (people added, latest year).</p></div>
      <div class="two-col" data-role="decomp"></div>
    </section>
  `;

  const scatterWrap = root.querySelector('[data-role="scatter"]') as HTMLElement;
  const stateSel = root.querySelector('[data-role="state"]') as HTMLSelectElement;

  const draw = (stateFilter: string) => {
    const pts = stateFilter ? pool.filter((l) => l.state === stateFilter) : pool;
    scatterWrap.innerHTML = '';
    const el = buildScatter(pts, { xMin, xMax, yMin, yMax }, (code) => ctx.openLga(code));
    scatterWrap.appendChild(el);
    attachSvgZoom(el, { maxScale: 12 });
  };
  draw('');
  stateSel.addEventListener('change', () => draw(stateSel.value));

  // decomposition bars (top 8 grow / bottom 8 shrink)
  const decomp = root.querySelector('[data-role="decomp"]') as HTMLElement;
  const withComp = data.lgas.filter((l) => l.totalChange != null && (l.pop ?? 0) >= 3000);
  const grow = [...withComp].sort((a, b) => (b.change1yr ?? 0) - (a.change1yr ?? 0)).slice(0, 8);
  const shrink = [...withComp].sort((a, b) => (a.growth1yr ?? 0) - (b.growth1yr ?? 0)).slice(0, 8);
  const maxAbs = Math.max(...withComp.flatMap((l) => ENGINE_ORDER.map((e) => Math.abs((e === 'natural' ? l.natural : e === 'netInternal' ? l.netInternal : l.netOverseas) ?? 0))));
  decomp.innerHTML = `
    <div><h3 class="col-h">Growing fastest</h3>${grow.map((l) => decompRow(l, maxAbs)).join('')}</div>
    <div><h3 class="col-h">Shrinking fastest</h3>${shrink.map((l) => decompRow(l, maxAbs)).join('')}</div>`;

  decomp.addEventListener('click', (e) => {
    const r = (e.target as Element).closest('[data-code]');
    if (r) ctx.openLga(r.getAttribute('data-code') as string);
  });
}

function decompRow(l: Lga, maxAbs: number): string {
  const segs = ENGINE_ORDER.map((e) => {
    const v = (e === 'natural' ? l.natural : e === 'netInternal' ? l.netInternal : l.netOverseas) ?? 0;
    if (v === 0) return '';
    const w = (Math.abs(v) / (maxAbs || 1)) * 50;
    return `<div class="eb-seg ${v < 0 ? 'left' : 'right'}" style="width:${w.toFixed(2)}%;background:${ENGINE[e]}" data-tip="${escapeHtml(`${ENGINE_LABEL[e]}: ${v >= 0 ? '+' : ''}${formatNumber(v)}`)}"></div>`;
  });
  const posSegs = ENGINE_ORDER.map((e, i) => (((e === 'natural' ? l.natural : e === 'netInternal' ? l.netInternal : l.netOverseas) ?? 0) > 0 ? segs[i] : '')).join('');
  const negSegs = ENGINE_ORDER.map((e, i) => (((e === 'natural' ? l.natural : e === 'netInternal' ? l.netInternal : l.netOverseas) ?? 0) < 0 ? segs[i] : '')).join('');
  return `<div class="decomp-row" data-code="${escapeHtml(l.code)}" role="button" tabindex="0">
    <div class="dr-name">${escapeHtml(l.name)}<em>${escapeHtml(stateAbbr(l.state))}</em></div>
    <div class="engine-bar"><div class="eb-side eb-neg">${negSegs}</div><div class="eb-mid"></div><div class="eb-side eb-pos">${posSegs}</div></div>
    <div class="dr-total" style="color:${(l.change1yr ?? 0) >= 0 ? 'var(--status-good)' : 'var(--status-bad)'}">${(l.change1yr ?? 0) >= 0 ? '+' : ''}${formatNumber(l.change1yr)}</div>
  </div>`;
}

function buildScatter(
  pts: Lga[],
  dom: { xMin: number; xMax: number; yMin: number; yMax: number },
  onSelect: (code: string) => void,
): SVGSVGElement {
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scatter', role: 'img' }) as SVGSVGElement;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const sx = (v: number) => M.l + ((v - dom.xMin) / (dom.xMax - dom.xMin)) * iw;
  const sy = (v: number) => M.t + (1 - (v - dom.yMin) / (dom.yMax - dom.yMin)) * ih;
  const x0 = sx(0);
  const y0 = sy(0);

  // quadrant tints
  const tint = (x: number, y: number, w: number, h: number, fill: string) => svg('rect', { x, y, width: Math.max(0, w), height: Math.max(0, h), fill, 'fill-opacity': '0.06' });
  el.append(
    tint(x0, M.t, M.l + iw - x0, y0 - M.t, TYPE_COLOUR.both), // top-right: both
    tint(M.l, M.t, x0 - M.l, y0 - M.t, TYPE_COLOUR.migration), // top-left: migration
    tint(x0, y0, M.l + iw - x0, M.t + ih - y0, TYPE_COLOUR.natural), // bottom-right: natural
    tint(M.l, y0, x0 - M.l, M.t + ih - y0, TYPE_COLOUR.emptying), // bottom-left: emptying
  );

  // axes (zero lines)
  el.append(svg('line', { x1: x0, y1: M.t, x2: x0, y2: M.t + ih, stroke: '#94a3b8', 'stroke-width': '1' }));
  el.append(svg('line', { x1: M.l, y1: y0, x2: M.l + iw, y2: y0, stroke: '#94a3b8', 'stroke-width': '1' }));
  // frame
  el.append(svg('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'none', stroke: '#e2e8f0', 'stroke-width': '1' }));

  // quadrant labels
  const qlabel = (x: number, y: number, text: string, anchor: string) => {
    const t = svg('text', { x, y, 'text-anchor': anchor, class: 'quad-label' });
    t.textContent = text;
    return t;
  };
  el.append(
    qlabel(M.l + iw - 8, M.t + 16, 'Growing on both', 'end'),
    qlabel(M.l + 8, M.t + 16, 'Migration-fed (ageing)', 'start'),
    qlabel(M.l + iw - 8, M.t + ih - 8, 'Natural growth, outflow', 'end'),
    qlabel(M.l + 8, M.t + ih - 8, 'Emptying', 'start'),
  );

  // axis titles
  const axt = (x: number, y: number, text: string, anchor = 'middle', rot?: string) => {
    const t = svg('text', { x, y, 'text-anchor': anchor, class: 'axis-title' });
    if (rot) t.setAttribute('transform', rot);
    t.textContent = text;
    return t;
  };
  el.append(axt(M.l + iw / 2, H - 16, 'Natural increase per 1,000  (births − deaths →)'));
  el.append(axt(16, M.t + ih / 2, 'Net migration per 1,000  (↑ inflow)', 'middle', `rotate(-90 16 ${M.t + ih / 2})`));

  // dots (largest first so small ones sit on top and stay hoverable)
  const sorted = [...pts].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  const g = svg('g');
  for (const l of sorted) {
    const r = Math.max(2.2, Math.min(16, Math.sqrt((l.pop ?? 0) / Math.PI) / 12));
    const cx = Math.max(M.l, Math.min(M.l + iw, sx(l.natRate as number)));
    const cy = Math.max(M.t, Math.min(M.t + ih, sy(l.netMigRate as number)));
    const dot = svg('circle', {
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: r.toFixed(1),
      fill: l.type ? TYPE_COLOUR[l.type] : '#94a3b8',
      'fill-opacity': '0.7',
      stroke: '#fff',
      'stroke-width': '0.6',
      class: 'dot',
      'data-code': l.code,
      'data-tip': `${l.name} (${stateAbbr(l.state)}) — pop ${formatNumber(l.pop)}\nNatural ${fmtSigned(l.natRate)} · Internal ${fmtSigned(l.netInternalRate)} · Overseas ${fmtSigned(l.netOverseasRate)} /1,000\nGrowth ${l.growth1yr != null && l.growth1yr >= 0 ? '+' : ''}${l.growth1yr?.toFixed(2)}%`,
      'aria-label': l.name,
    });
    g.append(dot);
  }
  el.append(g);

  el.addEventListener('click', (e) => {
    const d = (e.target as Element).closest('[data-code]');
    if (d) onSelect(d.getAttribute('data-code') as string);
  });
  return el;
}

function fmtSigned(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function quantile(nums: number[], q: number): number {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  return a[base + 1] !== undefined ? a[base] + (a[base + 1] - a[base]) * (pos - base) : a[base];
}
