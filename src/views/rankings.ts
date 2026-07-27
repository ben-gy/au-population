// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import { METRICS, metricByKey, ranked, median, type RankMetric } from '../analysis';
import { growthColour, ENGINE, stateAbbr } from '../colors';
import { escapeHtml, formatNumber, formatPercent } from '../utils/format';

export function renderRankings(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  let metric = metricByKey('growth1yr');
  let dir: 'desc' | 'asc' = 'desc';
  let state = '';

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Leaderboards</h2><p>Rank all councils by any measure. The dashed line marks the national median.</p></div>
      <div class="controls">
        <label>Measure
          <select data-role="metric">${METRICS.map((m) => `<option value="${m.key}">${escapeHtml(m.label)}</option>`).join('')}</select>
        </label>
        <label>State
          <select data-role="state"><option value="">All states</option>${[...new Set(data.lgas.map((l) => l.state))].filter(Boolean).sort().map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(stateAbbr(s))}</option>`).join('')}</select>
        </label>
        <div class="seg" data-role="dir"><button class="seg-btn active" data-d="desc">Highest</button><button class="seg-btn" data-d="asc">Lowest</button></div>
      </div>
      <p class="metric-desc" data-role="desc"></p>
      <div data-role="list"></div>
    </section>
  `;

  const listEl = root.querySelector('[data-role="list"]') as HTMLElement;
  const descEl = root.querySelector('[data-role="desc"]') as HTMLElement;

  const paint = () => {
    const pool = state ? data.lgas.filter((l) => l.state === state) : data.lgas;
    const rows = ranked(pool, metric, dir).slice(0, 30);
    const all = ranked(pool, metric).map((l) => metric.get(l) as number);
    const med = median(all);
    const maxAbs = Math.max(1, ...rows.map((l) => Math.abs(metric.get(l) as number)));
    descEl.textContent = metric.desc + `  National median: ${fmtVal(med, metric)}.`;
    const signed = rows.some((l) => (metric.get(l) as number) < 0);
    listEl.innerHTML = `
      <div class="rank-list">
        ${rows
          .map((l, i) => {
            const v = metric.get(l) as number;
            const w = (Math.abs(v) / maxAbs) * (signed ? 50 : 100);
            const colour = metric.key.includes('growth') || metric.key === 'natRate' || metric.key === 'netInternalRate' ? growthColour(v, -maxAbs, maxAbs) : ENGINE.netOverseas;
            const fill = signed
              ? `<div class="br-track"><div class="br-mid"></div><div class="br-fill ${v < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(1)}%;background:${colour}"></div></div>`
              : `<div class="br-track"><div class="br-fill" style="width:${w.toFixed(1)}%;background:${colour}"></div></div>`;
            return `<div class="rank-row" data-code="${escapeHtml(l.code)}" role="button" tabindex="0" data-tip="${escapeHtml(`${l.name} (${stateAbbr(l.state)}) — ${metric.label}: ${fmtVal(v, metric)}`)}">
              <div class="rank-n">${i + 1}</div>
              <div class="rank-name">${escapeHtml(l.name)}<em>${escapeHtml(stateAbbr(l.state))}</em></div>
              ${fill}
              <div class="rank-val">${fmtVal(v, metric)}</div>
            </div>`;
          })
          .join('')}
      </div>`;
  };
  paint();

  root.querySelector('[data-role="metric"]')?.addEventListener('change', (e) => {
    metric = metricByKey((e.target as HTMLSelectElement).value);
    paint();
  });
  root.querySelector('[data-role="state"]')?.addEventListener('change', (e) => {
    state = (e.target as HTMLSelectElement).value;
    paint();
  });
  root.querySelector('[data-role="dir"]')?.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-d]');
    if (!b) return;
    dir = b.getAttribute('data-d') as 'desc' | 'asc';
    root.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('active', x === b));
    paint();
  });
  listEl.addEventListener('click', (e) => {
    const r = (e.target as Element).closest('[data-code]');
    if (r) ctx.openLga(r.getAttribute('data-code') as string);
  });
}

function fmtVal(v: number, m: RankMetric): string {
  if (m.unit === 'pct') return `${v >= 0 ? '+' : ''}${formatPercent(v)}`;
  if (m.unit === 'rate') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}/1k`;
  return formatNumber(v);
}
