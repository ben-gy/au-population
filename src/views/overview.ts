// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import { ENGINE, ENGINE_LABEL, ENGINE_ORDER, TYPE_COLOUR, TYPE_LABEL, stateAbbr, growthColour } from '../colors';
import { ranked, metricByKey } from '../analysis';
import { glossaryTerm } from '../glossary';
import { sparkline } from '../components/charts';
import { escapeHtml, formatNumber, formatPercent } from '../utils/format';

export function renderOverview(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const n = data.national;
  const engines = ENGINE_ORDER.map((e) => ({ e, v: (n[e] ?? 0) as number }));
  const engTotal = engines.reduce((s, x) => s + Math.max(0, x.v), 0);
  const ratio = n.natural && n.netOverseas ? n.netOverseas / n.natural : null;

  const topGrow = ranked(data.lgas, metricByKey('growth1yr'), 'desc').slice(0, 6);
  const topShrink = ranked(data.lgas, metricByKey('growth1yr'), 'asc').slice(0, 6);
  const biggest = ranked(data.lgas, metricByKey('change1yr'), 'desc')[0];
  const osTop = ranked(data.lgas.filter((l) => (l.pop ?? 0) >= 50000), metricByKey('netOverseasRate'))[0];

  const moverRow = (l: (typeof topGrow)[number]) => `
    <button class="mover" data-code="${escapeHtml(l.code)}">
      <span class="mover-name">${escapeHtml(l.name)}<em>${escapeHtml(stateAbbr(l.state))}</em></span>
      <span class="mover-val" style="color:${growthColour(l.growth1yr)}">${l.growth1yr != null && l.growth1yr >= 0 ? '+' : ''}${formatPercent(l.growth1yr)}</span>
    </button>`;

  root.innerHTML = `
    <section class="hero">
      <div class="hero-lead">
        <h1>Australia grew to ${formatNumber(n.totalPop)} people</h1>
        <p>
          In ${n.latestYear} the population rose by roughly ${formatNumber((n.natural ?? 0) + (n.netMig ?? 0))} — but that single number
          hides three very different ${glossaryTerm('engine', 'engines')}. ${ratio ? `Net ${glossaryTerm('overseas', 'overseas migration')} added <strong>${ratio.toFixed(1)}×</strong> as many people as ${glossaryTerm('natural', 'natural increase')} (births minus deaths).` : ''}
          ${n.growing} councils grew; ${n.shrinking} shrank.
        </p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>How Australia grew in ${n.latestYear}</h2><p>The three national growth engines, in people added.</p></div>
      <div class="engine-national">
        ${engines.map(({ e, v }) => `
          <div class="en-block" data-tip="${escapeHtml(`${ENGINE_LABEL[e]}: ${v >= 0 ? '+' : ''}${formatNumber(v)}`)}">
            <div class="en-bar" style="height:${engTotal > 0 ? Math.max(4, (Math.max(0, v) / engTotal) * 160) : 4}px;background:${ENGINE[e]}"></div>
            <div class="en-val">${v >= 0 ? '+' : ''}${formatNumber(v)}</div>
            <div class="en-label"><span class="dot" style="background:${ENGINE[e]}"></span>${ENGINE_LABEL[e]}</div>
          </div>`).join('')}
      </div>
    </section>

    <section class="tile-row">
      ${tile('Fastest growing', topGrow[0]?.name, topGrow[0] ? `+${topGrow[0].growth1yr?.toFixed(1)}%` : '—', topGrow[0]?.code, 'var(--status-good)', stateAbbr(topGrow[0]?.state ?? ''))}
      ${tile('Fastest shrinking', topShrink[0]?.name, topShrink[0] ? `${topShrink[0].growth1yr?.toFixed(1)}%` : '—', topShrink[0]?.code, 'var(--status-bad)', stateAbbr(topShrink[0]?.state ?? ''))}
      ${tile('Most people added', biggest?.name, biggest ? `+${formatNumber(biggest.change1yr)}` : '—', biggest?.code, 'var(--accent-secondary)', stateAbbr(biggest?.state ?? ''))}
      ${tile('Most overseas-fed', osTop?.name, osTop ? `${osTop.netOverseasRate?.toFixed(1)}/1k` : '—', osTop?.code, ENGINE.netOverseas, stateAbbr(osTop?.state ?? ''))}
    </section>

    <div class="two-col">
      <section class="panel">
        <div class="panel-head"><h2>Fastest growing councils</h2><p>Population change over the latest year (population ≥ 3,000).</p></div>
        <div class="mover-list">${topGrow.map(moverRow).join('')}</div>
        <button class="link-btn" data-goto="rankings">See all rankings →</button>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Fastest shrinking councils</h2><p>The places losing population fastest.</p></div>
        <div class="mover-list">${topShrink.map(moverRow).join('')}</div>
        <button class="link-btn" data-goto="rankings">See all rankings →</button>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head"><h2>Four kinds of place</h2><p>Every council falls into one of four demographic types — by whether births beat deaths, and whether more people arrive than leave.</p></div>
      <div class="type-bar" data-role="typebar"></div>
      <div class="type-legend">
        ${(['both', 'natural', 'migration', 'emptying'] as const).map((t) => `
          <button class="type-leg" data-goto-type="${t}"><span class="dot" style="background:${TYPE_COLOUR[t]}"></span>${TYPE_LABEL[t]} <strong>${n.typeCounts[t]}</strong></button>`).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>National population, ${data.meta.firstYear}–${n.latestYear}</h2><p>Two decades of growth.</p></div>
      <div data-role="natspark" class="wide-spark"></div>
    </section>
  `;

  // type bar
  const typebar = root.querySelector('[data-role="typebar"]') as HTMLElement;
  const total = data.lgas.length;
  typebar.innerHTML = (['both', 'natural', 'migration', 'emptying'] as const)
    .map((t) => `<div class="type-seg" style="flex:${n.typeCounts[t]};background:${TYPE_COLOUR[t]}" data-tip="${escapeHtml(`${TYPE_LABEL[t]}: ${n.typeCounts[t]} councils (${formatPercent((n.typeCounts[t] / total) * 100)})`)}"></div>`)
    .join('');

  // national sparkline
  const ns = root.querySelector('[data-role="natspark"]') as HTMLElement;
  ns.appendChild(sparkline(data.natSeries, { w: 900, h: 120, colour: '#0d9488', pad: 6 }));

  // interactions
  root.addEventListener('click', (e) => {
    const mv = (e.target as Element).closest('[data-code]');
    if (mv) return ctx.openLga(mv.getAttribute('data-code') as string);
    const goto = (e.target as Element).closest('[data-goto]');
    if (goto) return ctx.goTo(goto.getAttribute('data-goto') as never);
    const gt = (e.target as Element).closest('[data-goto-type]');
    if (gt) return ctx.goToWith('explorer', { type: gt.getAttribute('data-goto-type') as string });
  });
}

function tile(label: string, name: string | undefined, value: string, code: string | undefined, colour: string, sub: string): string {
  return `<button class="stat-tile" ${code ? `data-code="${escapeHtml(code)}"` : ''}>
    <div class="st-label">${escapeHtml(label)}</div>
    <div class="st-value" style="color:${colour}">${escapeHtml(value)}</div>
    <div class="st-name">${escapeHtml(name ?? '—')}${sub ? ` <em>${escapeHtml(sub)}</em>` : ''}</div>
  </button>`;
}
