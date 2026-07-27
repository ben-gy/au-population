// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import type { Lga } from '../types';
import { ENGINE, TYPE_COLOUR, TYPE_LABEL, growthColour, stateAbbr, stateColour } from '../colors';
import { sparkline, engineBar } from '../components/charts';
import { escapeHtml, formatNumber, formatPercent } from '../utils/format';

type SortKey = 'name' | 'pop' | 'growth1yr' | 'growth5yr' | 'natRate' | 'netInternalRate' | 'netOverseasRate';

export function renderExplorer(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const params = (ctx as unknown as { takeParams?: () => Record<string, string> | null }).takeParams?.() ?? null;

  let q = '';
  let state = params?.state ?? '';
  let type = params?.type ?? '';
  let sortKey: SortKey = 'growth1yr';
  let sortDir: 'asc' | 'desc' = 'desc';
  let band: [number, number] | null = null;

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Explore every council</h2><p>Search, filter and sort all ${formatNumber(data.lgas.length)} councils. Click the histogram to filter by growth rate; click a row to open it.</p></div>
      <div class="controls">
        <input class="filter-input" type="search" placeholder="Filter by name…" data-role="q" value="${escapeHtml(q)}" />
        <label>State<select data-role="state"><option value="">All</option>${[...new Set(data.lgas.map((l) => l.state))].filter(Boolean).sort().map((s) => `<option value="${escapeHtml(s)}"${s === state ? ' selected' : ''}>${escapeHtml(stateAbbr(s))}</option>`).join('')}</select></label>
        <label>Type<select data-role="type"><option value="">All types</option>${(['both', 'natural', 'migration', 'emptying'] as const).map((t) => `<option value="${t}"${t === type ? ' selected' : ''}>${escapeHtml(TYPE_LABEL[t])}</option>`).join('')}</select></label>
        <button class="link-btn" data-role="clear">Clear filters</button>
      </div>
      <div class="histo" data-role="histo"></div>
      <div class="table-scroll">
        <table class="data" data-role="table">
          <thead><tr>
            <th data-sort="name" class="sortable">Council</th>
            <th data-sort="pop" class="sortable t-num">Population</th>
            <th class="t-num">Trend</th>
            <th data-sort="growth1yr" class="sortable t-num">Growth 1yr</th>
            <th data-sort="growth5yr" class="sortable t-num">5yr</th>
            <th class="t-num">Engines (people)</th>
            <th data-sort="natRate" class="sortable t-num">Nat/1k</th>
            <th data-sort="netInternalRate" class="sortable t-num">Int/1k</th>
            <th data-sort="netOverseasRate" class="sortable t-num">O/S/1k</th>
          </tr></thead>
          <tbody data-role="tbody"></tbody>
        </table>
      </div>
    </section>
  `;

  const tbody = root.querySelector('[data-role="tbody"]') as HTMLElement;
  const histoEl = root.querySelector('[data-role="histo"]') as HTMLElement;
  const maxAbsEngine = Math.max(...data.lgas.flatMap((l) => [l.natural, l.netInternal, l.netOverseas].map((v) => Math.abs(v ?? 0))));

  const filtered = (): Lga[] => {
    const ql = q.trim().toLowerCase();
    return data.lgas.filter((l) => {
      if (state && l.state !== state) return false;
      if (type && l.type !== type) return false;
      if (ql && !l.name.toLowerCase().includes(ql)) return false;
      if (band && (l.growth1yr == null || l.growth1yr < band[0] || l.growth1yr >= band[1])) return false;
      return true;
    });
  };

  const sortRows = (rows: Lga[]): Lga[] =>
    [...rows].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (sortKey === 'name') {
        va = a.name;
        vb = b.name;
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = (a[sortKey] as number) ?? -Infinity;
      vb = (b[sortKey] as number) ?? -Infinity;
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

  const paintHisto = () => {
    // distribution of growth1yr over the current state/type filter (ignoring band)
    const base = data.lgas.filter((l) => (!state || l.state === state) && (!type || l.type === type) && l.growth1yr != null);
    const lo = -3;
    const hi = 7;
    const step = 0.5;
    const bins: number[] = [];
    for (let x = lo; x < hi; x += step) bins.push(0);
    for (const l of base) {
      const g = Math.max(lo, Math.min(hi - 0.001, l.growth1yr as number));
      bins[Math.floor((g - lo) / step)]++;
    }
    const max = Math.max(1, ...bins);
    histoEl.innerHTML = bins
      .map((c, i) => {
        const x0 = lo + i * step;
        const x1 = x0 + step;
        const active = band && band[0] === x0;
        return `<button class="histo-bar${active ? ' active' : ''}" data-lo="${x0}" data-hi="${x1}" style="height:${(c / max) * 100}%;background:${growthColour((x0 + x1) / 2, -3, 7)}" data-tip="${escapeHtml(`${x0 >= 0 ? '+' : ''}${x0}% to ${x1 >= 0 ? '+' : ''}${x1}%: ${c} councils`)}" aria-label="${c} councils"></button>`;
      })
      .join('');
  };

  const paint = () => {
    const rows = sortRows(filtered());
    root.querySelectorAll('[data-sort]').forEach((th) => {
      const k = th.getAttribute('data-sort');
      th.classList.toggle('sorted', k === sortKey);
      th.setAttribute('aria-sort', k === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No councils match these filters.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .slice(0, 400)
      .map((l) => `
        <tr data-code="${escapeHtml(l.code)}">
          <td><span class="pill sm" style="background:${stateColour(l.state)}">${escapeHtml(stateAbbr(l.state))}</span> ${escapeHtml(l.name)}${l.type ? ` <span class="type-dot" style="background:${TYPE_COLOUR[l.type]}" data-tip="${escapeHtml(TYPE_LABEL[l.type])}"></span>` : ''}</td>
          <td class="t-num">${formatNumber(l.pop)}</td>
          <td class="t-spark" data-role="spark" data-code="${escapeHtml(l.code)}"></td>
          <td class="t-num" style="color:${growthColour(l.growth1yr, -3, 6)};font-weight:600">${l.growth1yr != null && l.growth1yr >= 0 ? '+' : ''}${formatPercent(l.growth1yr)}</td>
          <td class="t-num">${l.growth5yr != null && l.growth5yr >= 0 ? '+' : ''}${formatPercent(l.growth5yr)}</td>
          <td class="t-eng">${engineBar({ natural: l.natural, netInternal: l.netInternal, netOverseas: l.netOverseas }, maxAbsEngine)}</td>
          <td class="t-num" style="color:${l.natRate != null && l.natRate < 0 ? 'var(--status-bad)' : 'var(--text-secondary)'}">${sr(l.natRate)}</td>
          <td class="t-num" style="color:${l.netInternalRate != null && l.netInternalRate < 0 ? 'var(--status-bad)' : 'var(--text-secondary)'}">${sr(l.netInternalRate)}</td>
          <td class="t-num" style="color:${ENGINE.netOverseas}">${sr(l.netOverseasRate)}</td>
        </tr>`)
      .join('');
    // sparklines
    tbody.querySelectorAll('[data-role="spark"]').forEach((cell) => {
      const l = data.byCode.get(cell.getAttribute('data-code') as string);
      if (l) cell.appendChild(sparkline(l.series, { w: 84, h: 24, colour: (l.growth1yr ?? 0) < 0 ? '#b91c1c' : '#0d9488' }));
    });
    if (rows.length > 400) {
      tbody.insertAdjacentHTML('beforeend', `<tr><td colspan="9" class="empty">Showing the first 400 of ${formatNumber(rows.length)}. Refine the filters to narrow down.</td></tr>`);
    }
  };

  paintHisto();
  paint();

  root.querySelector('[data-role="q"]')?.addEventListener('input', (e) => {
    q = (e.target as HTMLInputElement).value;
    window.clearTimeout((paint as unknown as { t?: number }).t);
    (paint as unknown as { t?: number }).t = window.setTimeout(paint, 250);
  });
  root.querySelector('[data-role="state"]')?.addEventListener('change', (e) => {
    state = (e.target as HTMLSelectElement).value;
    band = null;
    paintHisto();
    paint();
  });
  root.querySelector('[data-role="type"]')?.addEventListener('change', (e) => {
    type = (e.target as HTMLSelectElement).value;
    band = null;
    paintHisto();
    paint();
  });
  root.querySelector('[data-role="clear"]')?.addEventListener('click', () => {
    q = state = type = '';
    band = null;
    (root.querySelector('[data-role="q"]') as HTMLInputElement).value = '';
    (root.querySelector('[data-role="state"]') as HTMLSelectElement).value = '';
    (root.querySelector('[data-role="type"]') as HTMLSelectElement).value = '';
    paintHisto();
    paint();
  });
  histoEl.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-lo]');
    if (!b) return;
    const lo = Number(b.getAttribute('data-lo'));
    const hi = Number(b.getAttribute('data-hi'));
    band = band && band[0] === lo ? null : [lo, hi];
    paintHisto();
    paint();
  });
  root.querySelector('[data-role="table"]')?.addEventListener('click', (e) => {
    const th = (e.target as Element).closest('[data-sort]');
    if (th) {
      const k = th.getAttribute('data-sort') as SortKey;
      if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortKey = k;
        sortDir = k === 'name' ? 'asc' : 'desc';
      }
      paint();
      return;
    }
    const row = (e.target as Element).closest('tr[data-code]');
    if (row) ctx.openLga(row.getAttribute('data-code') as string);
  });
}

function sr(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}
