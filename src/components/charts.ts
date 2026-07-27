// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/** Small hand-rolled SVG/HTML chart primitives. No chart libraries. */
import { ENGINE, ENGINE_LABEL, type Engine } from '../colors';
import { escapeHtml, formatNumber } from '../utils/format';

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * A sparkline for a year→value series. Draws a filled area + line, with an
 * optional break where the series has gaps. Returns an <svg>.
 */
export function sparkline(
  series: Record<string, number>,
  opts: { w?: number; h?: number; colour?: string; pad?: number } = {},
): SVGElement {
  const w = opts.w ?? 160;
  const h = opts.h ?? 40;
  const pad = opts.pad ?? 3;
  const colour = opts.colour ?? '#0d9488';
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  const vals = years.map((y) => series[y]);
  const el = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'spark', preserveAspectRatio: 'none' });
  if (years.length < 2) return el;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (years.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = svg('polygon', {
    points: `${pad},${h - pad} ${pts.join(' ')} ${w - pad},${h - pad}`,
    fill: colour,
    'fill-opacity': '0.12',
  });
  const line = svg('polyline', { points: pts.join(' '), fill: 'none', stroke: colour, 'stroke-width': '1.5', 'stroke-linejoin': 'round' });
  el.append(area, line);
  // end dot
  const last = svg('circle', { cx: x(years.length - 1), cy: y(vals[vals.length - 1]), r: '1.8', fill: colour });
  el.append(last);
  return el;
}

/**
 * A signed engine-contribution bar: the three engines drawn from a centre line,
 * positive to the right, negative to the left, scaled to `maxAbs`. HTML string.
 * Every segment carries a [data-tip].
 */
export function engineBar(
  parts: { natural: number | null; netInternal: number | null; netOverseas: number | null },
  maxAbs: number,
  opts: { height?: number } = {},
): string {
  const hgt = opts.height ?? 16;
  const engines: Engine[] = ['natural', 'netInternal', 'netOverseas'];
  const pos: string[] = [];
  const neg: string[] = [];
  for (const e of engines) {
    const v = parts[e];
    if (v == null || v === 0) continue;
    const pct = (Math.abs(v) / (maxAbs || 1)) * 50; // half-width each side
    const seg = `<div class="eb-seg" style="width:${Math.min(50, pct).toFixed(2)}%;background:${ENGINE[e]}" data-tip="${escapeHtml(`${ENGINE_LABEL[e]}: ${v > 0 ? '+' : ''}${formatNumber(v)}`)}"></div>`;
    if (v > 0) pos.push(seg);
    else neg.unshift(seg);
  }
  return `<div class="engine-bar" style="height:${hgt}px">
    <div class="eb-side eb-neg">${neg.join('')}</div>
    <div class="eb-mid"></div>
    <div class="eb-side eb-pos">${pos.join('')}</div>
  </div>`;
}

/**
 * Horizontal ranking bar rows (div-based, overflow-safe). Each row: label,
 * track+fill sized by value (signed diverging), value text. Returns HTML.
 */
export function barRows(
  rows: Array<{ label: string; value: number; colour: string; tip?: string; code?: string; suffix?: string }>,
  opts: { maxAbs?: number; signed?: boolean } = {},
): string {
  const maxAbs = opts.maxAbs ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const signed = opts.signed ?? rows.some((r) => r.value < 0);
  return `<div class="bar-rows${signed ? ' signed' : ''}">${rows
    .map((r) => {
      const w = (Math.abs(r.value) / maxAbs) * (signed ? 50 : 100);
      const fill = signed
        ? `<div class="br-track"><div class="br-mid"></div><div class="br-fill ${r.value < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(1)}%;background:${r.colour}"></div></div>`
        : `<div class="br-track"><div class="br-fill" style="width:${w.toFixed(1)}%;background:${r.colour}"></div></div>`;
      return `<div class="bar-row"${r.code ? ` data-code="${escapeHtml(r.code)}" role="button" tabindex="0"` : ''}${r.tip ? ` data-tip="${escapeHtml(r.tip)}"` : ''}>
        <div class="br-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</div>
        ${fill}
        <div class="br-value">${escapeHtml(r.suffix ?? '')}</div>
      </div>`;
    })
    .join('')}</div>`;
}
