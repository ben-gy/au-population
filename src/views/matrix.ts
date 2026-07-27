// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import { ENGINE, ENGINE_LABEL, ENGINE_ORDER, growthColour, stateAbbr, stateColour } from '../colors';
import { glossaryTerm } from '../glossary';
import { escapeHtml, formatNumber } from '../utils/format';

export function renderMatrix(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const states = [...data.stateAgg].sort((a, b) => b.pop - a.pop);
  const rateKeys = [
    { key: 'natRate', engine: 'natural' as const },
    { key: 'netInternalRate', engine: 'netInternal' as const },
    { key: 'netOverseasRate', engine: 'netOverseas' as const },
  ];
  const maxAbs = Math.max(...states.flatMap((s) => rateKeys.map((r) => Math.abs((s as unknown as Record<string, number>)[r.key]))));

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>How each state grows</h2>
        <p>The three ${glossaryTerm('engine', 'engines')} as a ${glossaryTerm('rate', 'rate per 1,000 residents')}, by state. Note ${glossaryTerm('internal', 'net internal migration')} sums to zero across the country — Queensland and WA gain the people NSW and the territories lose.</p>
      </div>
      <div class="matrix-scroll">
        <table class="matrix">
          <thead><tr><th class="mx-corner">State</th>${ENGINE_ORDER.map((e) => `<th><span class="dot" style="background:${ENGINE[e]}"></span>${ENGINE_LABEL[e]}</th>`).join('')}<th>Total /1k</th></tr></thead>
          <tbody>
            ${states
              .map((s) => {
                const totalRate = ((s.totalChange / s.pop) * 1000);
                return `<tr data-state="${escapeHtml(s.state)}" role="button" tabindex="0">
                  <th class="mx-row"><span class="pill" style="background:${stateColour(s.state)}">${escapeHtml(stateAbbr(s.state))}</span> <span class="mx-pop">${formatNumber(s.pop)}</span></th>
                  ${rateKeys
                    .map((r) => {
                      const v = (s as unknown as Record<string, number>)[r.key];
                      return `<td class="mx-cell" style="background:${growthColour(v, -maxAbs, maxAbs)}" data-tip="${escapeHtml(`${stateAbbr(s.state)} — ${ENGINE_LABEL[r.engine]}: ${v >= 0 ? '+' : ''}${v.toFixed(1)}/1,000`)}">${v >= 0 ? '+' : ''}${v.toFixed(1)}</td>`;
                    })
                    .join('')}
                  <td class="mx-cell strong" style="background:${growthColour(totalRate, -maxAbs, maxAbs)}">${totalRate >= 0 ? '+' : ''}${totalRate.toFixed(1)}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="chart-foot">Click a state to see its councils in the Explorer. Cell colour: red = loss, teal = gain, per 1,000 residents.</p>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Engine composition by state</h2><p>What share of each state’s people-added came from each engine (positive engines only).</p></div>
      <div class="state-comp" data-role="comp"></div>
    </section>
  `;

  // composition stacked bars
  const comp = root.querySelector('[data-role="comp"]') as HTMLElement;
  comp.innerHTML = states
    .map((s) => {
      const parts = ENGINE_ORDER.map((e) => ({ e, v: Math.max(0, (s as unknown as Record<string, number>)[e] as number) }));
      const tot = parts.reduce((a, b) => a + b.v, 0) || 1;
      return `<div class="comp-row">
        <div class="comp-name"><span class="pill" style="background:${stateColour(s.state)}">${escapeHtml(stateAbbr(s.state))}</span></div>
        <div class="comp-bar">${parts
          .map((p) => (p.v > 0 ? `<div class="comp-seg" style="width:${((p.v / tot) * 100).toFixed(1)}%;background:${ENGINE[p.e]}" data-tip="${escapeHtml(`${ENGINE_LABEL[p.e]}: ${formatNumber(p.v)} (${((p.v / tot) * 100).toFixed(0)}%)`)}"></div>` : ''))
          .join('')}</div>
      </div>`;
    })
    .join('');

  root.addEventListener('click', (e) => {
    const row = (e.target as Element).closest('[data-state]');
    if (row) ctx.goToWith('explorer', { state: row.getAttribute('data-state') as string });
  });
}
