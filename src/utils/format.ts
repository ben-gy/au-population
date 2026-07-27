// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/** Formatting helpers. All display numbers flow through here. */

export function formatNumber(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatPercent(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Title-case a make/model that arrives SHOUTING in the data ("BYD ATTO 3"). */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    // keep short brand tokens uppercase (MG, BMW, BYD, MG4)
    .replace(/\b(Mg|Bmw|Byd|Bev|Ev|Suv|Gt|Ev6|Mg4|Mg5|Zs|Ute)\b/gi, (m) => m.toUpperCase());
}
