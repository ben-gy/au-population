// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { ViewContext } from '../viewContext';
import { insights } from '../analysis';
import { escapeHtml } from '../utils/format';

export function renderInsights(root: HTMLElement, ctx: ViewContext): void {
  const found = insights(ctx.data);
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>What stands out</h2><p>Findings detected automatically from the ${ctx.data.national.latestYear} data. Click any that names a council to open it.</p></div>
      <div class="insight-grid">
        ${found
          .map(
            (f) => `<div class="insight-card ${f.severity}${f.code ? ' clickable' : ''}"${f.code ? ` data-code="${escapeHtml(f.code)}" role="button" tabindex="0"` : ''}>
              <div class="insight-sev">${f.severity === 'alert' ? '▲' : f.severity === 'warn' ? '●' : 'ℹ'}</div>
              <div class="insight-body"><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.body)}</p>${f.code ? '<span class="insight-open">Open council →</span>' : ''}</div>
            </div>`,
          )
          .join('')}
      </div>
    </section>
  `;
  root.addEventListener('click', (e) => {
    const c = (e.target as Element).closest('[data-code]');
    if (c) ctx.openLga(c.getAttribute('data-code') as string);
  });
}
