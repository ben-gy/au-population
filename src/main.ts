// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import './styles.css';
import { loadDataset, searchLgas, type Dataset } from './data';
import type { ViewId } from './types';
import type { ViewContext } from './viewContext';
import { initTooltip } from './components/tooltip';
import { initGlossary } from './components/glossaryPopover';
import { createAbout } from './components/about';
import { createDrilldown } from './components/drilldown';
import { stateAbbr } from './colors';
import { renderOverview } from './views/overview';
import { renderEngines } from './views/engines';
import { renderMap } from './views/map';
import { renderRankings } from './views/rankings';
import { renderTrends } from './views/trends';
import { renderTreemap } from './views/treemap';
import { renderMatrix } from './views/matrix';
import { renderExplorer } from './views/explorer';
import { renderInsights } from './views/insights';
import { escapeHtml, formatNumber } from './utils/format';

const VIEWS: Array<{ id: ViewId; label: string; render: (root: HTMLElement, ctx: ViewContext) => void }> = [
  { id: 'overview', label: 'Overview', render: renderOverview },
  { id: 'engines', label: 'Growth Engines', render: renderEngines },
  { id: 'map', label: 'Map', render: renderMap },
  { id: 'rankings', label: 'Rankings', render: renderRankings },
  { id: 'trends', label: 'Trends', render: renderTrends },
  { id: 'treemap', label: 'Treemap', render: renderTreemap },
  { id: 'matrix', label: 'States', render: renderMatrix },
  { id: 'explorer', label: 'Explorer', render: renderExplorer },
  { id: 'insights', label: 'Insights', render: renderInsights },
];

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="16" r="13" fill="#f1f5f9"/>
  <path d="M6 22 L11 13 L15 18 L20 8 L26 20" fill="none" stroke="#0d9488" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="11" cy="13" r="1.7" fill="#6366f1"/>
  <circle cx="20" cy="8" r="1.7" fill="#f59e0b"/>
  <circle cx="26" cy="20" r="1.7" fill="#0d9488"/>
</svg>`;

let pendingParams: Record<string, string> | null = null;

function parseHash(): { view: ViewId | null; code: string | null } {
  const h = location.hash.replace(/^#/, '');
  if (!h) return { view: null, code: null };
  if (h.startsWith('lga=')) return { view: null, code: h.slice('lga='.length) };
  const view = VIEWS.find((v) => v.id === h)?.id ?? null;
  return { view, code: null };
}

function shell(app: HTMLElement, data: Dataset): void {
  const { meta, national } = data;

  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#overview">${LOGO}<span>Population Change</span><span class="brand-sub">Where Australia grows &amp; shrinks</span></a>
        <div class="search-wrap">
          <input class="search-input" type="search" placeholder="Search a council (LGA)…" aria-label="Search a council" autocomplete="off" />
          <div class="search-results" role="listbox"></div>
        </div>
        <div class="header-spacer"></div>
        <button class="icon-btn" data-role="about" aria-label="About this site" title="About this site">?</button>
      </div>
    </header>
    <nav class="nav-tabs" aria-label="Views">
      <div class="nav-inner" role="tablist">
        ${VIEWS.map((v) => `<button class="nav-tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`).join('')}
      </div>
    </nav>
    <main class="main-content" id="view-root"></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span>
          Data: <a href="https://www.abs.gov.au/statistics/people/population/regional-population" target="_blank" rel="noopener">ABS Regional Population</a>
          (ERP + components of change, ${meta.referenceYear}) · boundaries ABS ASGS 2024 (CC BY 4.0).
          ${formatNumber(meta.lgaCount)} councils.
        </span>
        <span>
          Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> ·
          <a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
        </span>
      </div>
    </footer>
  `;

  const viewRoot = app.querySelector('#view-root') as HTMLElement;
  const about = createAbout(meta, national);
  const drill = createDrilldown(data);
  let current: ViewId = 'overview';

  const ctx: ViewContext = {
    data,
    openLga: (code) => drill.open(code),
    goTo: (v) => show(v),
    goToWith: (v, params) => {
      pendingParams = params;
      show(v);
    },
  };
  // expose pending params to views via a getter
  (ctx as unknown as { takeParams: () => Record<string, string> | null }).takeParams = () => {
    const p = pendingParams;
    pendingParams = null;
    return p;
  };

  function show(id: ViewId, pushHash = true): void {
    const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
    drill.close();
    current = view.id;
    app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-view') === current)));
    viewRoot.innerHTML = '';
    try {
      view.render(viewRoot, ctx);
    } catch {
      viewRoot.innerHTML = '<div class="error-box">Something went wrong rendering this view. Try another tab.</div>';
    }
    if (pushHash) history.replaceState(null, '', `#${current}`);
    window.scrollTo({ top: 0 });
  }

  app.querySelector('.nav-inner')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-view]');
    if (btn) show(btn.getAttribute('data-view') as ViewId);
  });
  app.querySelector('[data-role="about"]')?.addEventListener('click', () => about.open());
  app.querySelector('.brand')?.addEventListener('click', (e) => {
    e.preventDefault();
    show('overview');
  });

  // ── Header search ──
  const input = app.querySelector('.search-input') as HTMLInputElement;
  const results = app.querySelector('.search-results') as HTMLElement;
  let hits: ReturnType<typeof searchLgas> = [];
  let cursor = -1;
  const closeSearch = () => {
    results.innerHTML = '';
    cursor = -1;
  };
  const paint = () => {
    results.innerHTML = hits
      .map((l, i) => {
        const g = l.growth1yr;
        return `<button class="search-item" data-code="${escapeHtml(l.code)}" role="option" aria-selected="${i === cursor}">
          <strong>${escapeHtml(l.name)}</strong>
          <span>${escapeHtml(stateAbbr(l.state))} · ${formatNumber(l.pop)}</span>
          <em style="color:${g != null && g < 0 ? 'var(--status-bad)' : 'var(--status-good)'}">${g != null ? (g >= 0 ? '+' : '') + g.toFixed(1) + '%' : '—'}</em>
        </button>`;
      })
      .join('');
  };
  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      hits = searchLgas(data.lgas, input.value);
      cursor = -1;
      paint();
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      input.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = (cursor + 1) % hits.length;
      paint();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = (cursor - 1 + hits.length) % hits.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = hits[cursor >= 0 ? cursor : 0];
      if (pick) {
        drill.open(pick.code);
        input.value = '';
        closeSearch();
      }
    }
  });
  results.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-code]');
    if (!btn) return;
    drill.open(btn.getAttribute('data-code') as string);
    input.value = '';
    closeSearch();
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.search-wrap')) closeSearch();
  });

  // ── Routing ──
  const initial = parseHash();
  show(initial.view ?? 'overview', !initial.code);
  if (initial.code) drill.open(initial.code);
  window.addEventListener('hashchange', () => {
    const { view, code } = parseHash();
    if (code) drill.open(code);
    else if (view && view !== current) show(view, false);
  });
}

function renderError(app: HTMLElement, retry: () => void): void {
  app.innerHTML = `
    <main class="main-content">
      <div class="error-box">
        <strong>Could not load the data.</strong>
        <p style="margin-top:8px">Check your connection and try again.</p>
        <button type="button">Retry</button>
      </div>
    </main>`;
  app.querySelector('button')?.addEventListener('click', retry);
}

async function boot(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  app.innerHTML = `
    <main class="main-content">
      <div class="loading">Loading Australia’s population…</div>
      <div class="skeleton"></div>
    </main>`;
  initTooltip();
  initGlossary();
  try {
    const data = await loadDataset();
    shell(app, data);
  } catch {
    renderError(app, () => {
      void boot();
    });
  }
}

void boot();

export type { Dataset };
