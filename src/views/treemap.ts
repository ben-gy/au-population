// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import type { Lga } from '../types';
import { squarify } from '../components/treemap';
import { growthColour, stateAbbr } from '../colors';
import { formatNumber, formatPercent } from '../utils/format';

const W = 940;
const H = 600;

export function renderTreemap(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Every council, by size and growth</h2>
        <p>Rectangles are councils, grouped by state and sized by population. Teal grew over the latest year; red shrank. Click any to open it.</p>
      </div>
      <div class="map-legend">
        <span class="leg-title">Growth (1 yr)</span>
        ${[-3, -1, 0, 2, 5].map((v) => `<span class="leg-item"><span class="leg-swatch" style="background:${growthColour(v, -3, 5)}"></span>${v === 0 ? '0' : (v > 0 ? '+' : '') + v + '%'}</span>`).join('')}
      </div>
      <div class="treemap-wrap" data-role="tm"></div>
    </section>
  `;

  const wrap = root.querySelector('[data-role="tm"]') as HTMLElement;
  wrap.appendChild(buildTreemap(data.lgas, (code) => ctx.openLga(code)));
}

function buildTreemap(lgas: Lga[], onSelect: (code: string) => void): SVGSVGElement {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(SVGNS, 'svg');
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.setAttribute('class', 'treemap');

  // group by state
  const byState = new Map<string, Lga[]>();
  for (const l of lgas) {
    if (!l.pop) continue;
    const s = l.state || 'Other';
    if (!byState.has(s)) byState.set(s, []);
    byState.get(s)!.push(l);
  }
  const states = [...byState.entries()].map(([state, ls]) => ({ state, ls, pop: ls.reduce((s, l) => s + (l.pop ?? 0), 0) }));
  states.sort((a, b) => b.pop - a.pop);
  const stateRects = squarify(states.map((s) => s.pop), W, H);

  states.forEach((s, si) => {
    const r = stateRects[si];
    if (r.w < 1 || r.h < 1) return;
    const g = document.createElementNS(SVGNS, 'g');
    // LGAs within the state box (small inner padding for the state frame)
    const pad = 1;
    const innerX = r.x + pad;
    const innerY = r.y + pad;
    const innerW = Math.max(0, r.w - pad * 2);
    const innerH = Math.max(0, r.h - pad * 2);
    const ls = [...s.ls].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
    const cells = squarify(ls.map((l) => l.pop ?? 0), innerW, innerH);
    cells.forEach((c, ci) => {
      const l = ls[ci];
      if (c.w <= 0 || c.h <= 0) return;
      const rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', (innerX + c.x).toFixed(2));
      rect.setAttribute('y', (innerY + c.y).toFixed(2));
      rect.setAttribute('width', Math.max(0, c.w).toFixed(2));
      rect.setAttribute('height', Math.max(0, c.h).toFixed(2));
      rect.setAttribute('fill', growthColour(l.growth1yr, -3, 5));
      rect.setAttribute('stroke', '#ffffff');
      rect.setAttribute('stroke-width', '0.4');
      rect.setAttribute('class', 'tm-cell');
      rect.setAttribute('data-code', l.code);
      rect.setAttribute('data-tip', `${l.name} (${stateAbbr(l.state)})\nPopulation ${formatNumber(l.pop)}\nGrowth ${l.growth1yr != null && l.growth1yr >= 0 ? '+' : ''}${formatPercent(l.growth1yr)}`);
      g.append(rect);
      // label big cells
      if (c.w > 46 && c.h > 22) {
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('x', (innerX + c.x + 3).toFixed(1));
        t.setAttribute('y', (innerY + c.y + 13).toFixed(1));
        t.setAttribute('class', 'tm-label');
        t.textContent = l.name.length > c.w / 6 ? l.name.slice(0, Math.floor(c.w / 6)) + '…' : l.name;
        g.append(t);
      }
    });
    // state frame + label
    const frame = document.createElementNS(SVGNS, 'rect');
    frame.setAttribute('x', r.x.toFixed(2));
    frame.setAttribute('y', r.y.toFixed(2));
    frame.setAttribute('width', Math.max(0, r.w).toFixed(2));
    frame.setAttribute('height', Math.max(0, r.h).toFixed(2));
    frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke', '#0f172a');
    frame.setAttribute('stroke-width', '1.2');
    frame.setAttribute('pointer-events', 'none');
    g.append(frame);
    if (r.w > 40 && r.h > 24) {
      const st = document.createElementNS(SVGNS, 'text');
      st.setAttribute('x', (r.x + r.w - 4).toFixed(1));
      st.setAttribute('y', (r.y + r.h - 4).toFixed(1));
      st.setAttribute('text-anchor', 'end');
      st.setAttribute('class', 'tm-state');
      st.setAttribute('pointer-events', 'none');
      st.textContent = stateAbbr(s.state);
      g.append(st);
    }
    el.append(g);
  });

  el.addEventListener('click', (e) => {
    const c = (e.target as Element).closest('[data-code]');
    if (c) onSelect(c.getAttribute('data-code') as string);
  });
  return el as SVGSVGElement;
}
