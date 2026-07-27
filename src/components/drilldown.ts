// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { Dataset } from '../data';
import type { Lga } from '../types';
import { ENGINE, ENGINE_LABEL, ENGINE_ORDER, TYPE_COLOUR, TYPE_LABEL, TYPE_BLURB, stateAbbr, stateColour, growthColour } from '../colors';
import { sparkline } from './charts';
import { escapeHtml, formatNumber, formatPercent } from '../utils/format';
import { ranked, metricByKey } from '../analysis';

/**
 * Per-LGA drill-down drawer. Hash-linkable (#lga=10050). Detached from the DOM
 * when closed (a parked off-canvas panel scrolls the page on iOS Safari).
 */
export function createDrilldown(data: Dataset): { open: (code: string) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = '<div class="drawer-head"></div><div class="drawer-body"></div>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  drawer.appendChild(closeBtn);

  let mounted = false;
  const rankGrowth = ranked(data.lgas, metricByKey('growth1yr'));
  const rankGrowthN = rankGrowth.length;

  const close = () => {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    if (location.hash.startsWith('#lga=')) history.replaceState(null, '', location.pathname + location.search);
    window.setTimeout(() => {
      if (!drawer.classList.contains('open') && mounted) {
        overlay.remove();
        drawer.remove();
        mounted = false;
      }
    }, 260);
  };

  const open = (code: string) => {
    const l = data.byCode.get(code);
    if (!l) return;
    if (!mounted) {
      document.body.append(overlay, drawer);
      mounted = true;
    }
    render(l);
    // force reflow so the transition plays from the detached state
    void drawer.offsetWidth;
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawer.scrollTop = 0;
    closeBtn.focus();
    history.replaceState(null, '', `#lga=${code}`);
  };

  function render(l: Lga) {
    const head = drawer.querySelector('.drawer-head') as HTMLElement;
    const body = drawer.querySelector('.drawer-body') as HTMLElement;

    const rank = rankGrowth.findIndex((x) => x.code === l.code);
    const stateRank = rankGrowth.filter((x) => x.state === l.state);
    const stateRankIdx = stateRank.findIndex((x) => x.code === l.code);

    head.innerHTML = `
      <div class="drawer-title">${escapeHtml(l.name)}</div>
      <div class="drawer-sub">
        <span class="pill" style="background:${stateColour(l.state)}">${escapeHtml(stateAbbr(l.state))}</span>
        ${l.type ? `<span class="pill" style="background:${TYPE_COLOUR[l.type]}">${escapeHtml(TYPE_LABEL[l.type])}</span>` : ''}
      </div>`;

    const parts: string[] = [];

    // Key stats
    const gc = l.growth1yr != null ? growthColour(l.growth1yr) : '#94a3b8';
    parts.push(`
      <div class="drawer-section">
        <div class="kv-grid">
          <div class="kv"><div class="kv-label">Population (${data.national.latestYear})</div><div class="kv-value">${formatNumber(l.pop)}</div></div>
          <div class="kv"><div class="kv-label">Growth (1 yr)</div><div class="kv-value" style="color:${gc}">${l.growth1yr != null && l.growth1yr >= 0 ? '+' : ''}${formatPercent(l.growth1yr)}</div></div>
          <div class="kv"><div class="kv-label">People added</div><div class="kv-value">${l.change1yr != null && l.change1yr >= 0 ? '+' : ''}${formatNumber(l.change1yr)}</div></div>
          <div class="kv"><div class="kv-label">Growth (5 yr)</div><div class="kv-value" style="color:${l.growth5yr != null ? growthColour(l.growth5yr, -6, 20) : '#94a3b8'}">${l.growth5yr != null && l.growth5yr >= 0 ? '+' : ''}${formatPercent(l.growth5yr)}</div></div>
        </div>
      </div>`);

    // Population trajectory
    parts.push(`
      <div class="drawer-section">
        <h3>Population, ${l.firstYear}–${data.national.latestYear}</h3>
        <div data-role="spark" class="drawer-spark"></div>
      </div>`);

    // Growth engines (latest year)
    if (l.type) {
      parts.push(`
        <div class="drawer-section">
          <h3>What’s driving it (${data.national.latestYear})</h3>
          <p class="drawer-note">${escapeHtml(TYPE_BLURB[l.type])}</p>
          <div class="engine-list">
            ${ENGINE_ORDER.map((e) => {
              const raw = e === 'natural' ? l.natural : e === 'netInternal' ? l.netInternal : l.netOverseas;
              const rate = e === 'natural' ? l.natRate : e === 'netInternal' ? l.netInternalRate : l.netOverseasRate;
              return `<div class="engine-row" data-tip="${escapeHtml(`${ENGINE_LABEL[e]}: ${raw != null && raw >= 0 ? '+' : ''}${formatNumber(raw)} people`)}">
                <span class="engine-dot" style="background:${ENGINE[e]}"></span>
                <span class="engine-name">${ENGINE_LABEL[e]}</span>
                <span class="engine-val" style="color:${(raw ?? 0) >= 0 ? 'var(--status-good)' : 'var(--status-bad)'}">${raw != null && raw >= 0 ? '+' : ''}${formatNumber(raw)}</span>
                <span class="engine-rate">${rate != null && rate >= 0 ? '+' : ''}${rate?.toFixed(1) ?? '—'}/1k</span>
              </div>`;
            }).join('')}
          </div>
          <div class="births-deaths">
            <span data-tip="Births in ${data.national.latestYear}">Births ${formatNumber(l.births)}</span>
            <span data-tip="Deaths in ${data.national.latestYear}">Deaths ${formatNumber(l.deaths)}</span>
          </div>
        </div>`);
    }

    // Rank vs nation
    if (rank >= 0) {
      parts.push(`
        <div class="drawer-section">
          <h3>How it ranks</h3>
          <p class="drawer-note">
            <strong>#${rank + 1}</strong> of ${formatNumber(rankGrowthN)} councils by growth rate${
              stateRankIdx >= 0 ? `, <strong>#${stateRankIdx + 1}</strong> of ${formatNumber(stateRank.length)} in ${escapeHtml(stateAbbr(l.state))}` : ''
            }. National population change this year: ${data.national.growing} councils grew, ${data.national.shrinking} shrank.
          </p>
        </div>`);
    }

    body.innerHTML = parts.join('');
    const sparkSlot = body.querySelector('[data-role="spark"]') as HTMLElement;
    sparkSlot.appendChild(sparkline(l.series, { w: 360, h: 70, colour: l.growth1yr != null && l.growth1yr < 0 ? '#b91c1c' : '#0d9488' }));
  }

  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });

  return { open, close };
}
