// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import L from 'leaflet';
import type { ViewContext } from '../viewContext';
import type { Lga } from '../types';
import { loadGeo } from '../data';
import { growthColour, seqColour, ENGINE, stateAbbr } from '../colors';
import { escapeHtml, formatNumber, formatPercent } from '../utils/format';

interface Measure {
  key: string;
  label: string;
  get: (l: Lga) => number | null;
  colour: (v: number | null) => string;
  fmt: (v: number | null) => string;
  legend: Array<{ swatch: string; label: string }>;
}

export function renderMap(root: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;

  const divLegend = (neg: number, pos: number, unit: string) => [
    { swatch: growthColour(neg, neg, pos), label: `${neg}${unit}` },
    { swatch: growthColour(neg / 2, neg, pos), label: '' },
    { swatch: growthColour(0, neg, pos), label: '0' },
    { swatch: growthColour(pos / 2, neg, pos), label: '' },
    { swatch: growthColour(pos, neg, pos), label: `+${pos}${unit}` },
  ];

  const MEASURES: Measure[] = [
    { key: 'growth1yr', label: 'Growth rate (1 yr)', get: (l) => l.growth1yr, colour: (v) => growthColour(v, -2, 6), fmt: (v) => sfmtPct(v), legend: divLegend(-2, 6, '%') },
    { key: 'growth5yr', label: 'Growth rate (5 yr)', get: (l) => l.growth5yr, colour: (v) => growthColour(v, -6, 20), fmt: (v) => sfmtPct(v), legend: divLegend(-6, 20, '%') },
    { key: 'natRate', label: 'Natural increase /1k', get: (l) => l.natRate, colour: (v) => growthColour(v, -6, 10), fmt: (v) => sfmtRate(v), legend: divLegend(-6, 10, '') },
    { key: 'netInternalRate', label: 'Net internal migration /1k', get: (l) => l.netInternalRate, colour: (v) => growthColour(v, -25, 25), fmt: (v) => sfmtRate(v), legend: divLegend(-25, 25, '') },
    { key: 'netOverseasRate', label: 'Net overseas migration /1k', get: (l) => l.netOverseasRate, colour: (v) => seqColour(v, 40, ENGINE.netOverseas), fmt: (v) => sfmtRate(v), legend: seqLegend(40, ENGINE.netOverseas, '/1k') },
    { key: 'pop', label: 'Population', get: (l) => l.pop, colour: (v) => seqColour(v ? Math.log10(v) : null, 6.2, '#0369a1'), fmt: (v) => formatNumber(v), legend: seqLegend(0, '#0369a1', '', ['1k', '10k', '100k', '1M']) },
  ];

  let measure = MEASURES[0];

  root.innerHTML = `
    <section class="panel map-panel">
      <div class="panel-head">
        <h2>The map of change</h2>
        <p>${escapeHtml(String(data.meta.lgaCount))} councils shaded by the chosen measure. Click any area to open it. Reds shrink, teals grow.</p>
      </div>
      <div class="controls">
        <div class="seg" data-role="measure">
          ${MEASURES.map((m, i) => `<button class="seg-btn${i === 0 ? ' active' : ''}" data-m="${m.key}">${escapeHtml(m.label)}</button>`).join('')}
        </div>
      </div>
      <div class="map-frame" data-role="map"><div class="map-canvas"></div></div>
      <div class="map-legend" data-role="legend"></div>
    </section>
  `;

  const canvas = root.querySelector('.map-canvas') as HTMLElement;
  const legendEl = root.querySelector('[data-role="legend"]') as HTMLElement;

  const map = L.map(canvas, { minZoom: 3, maxZoom: 11, zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO · Boundaries: ABS ASGS 2024 (CC BY 4.0)',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 11,
  }).addTo(map);

  let layer: L.GeoJSON | null = null;

  const style = (code: string) => {
    const l = data.byCode.get(code);
    return {
      fillColor: l ? measure.colour(measure.get(l)) : '#eef2f6',
      fillOpacity: 0.82,
      color: '#ffffff',
      weight: 0.5,
    };
  };

  const paintLegend = () => {
    legendEl.innerHTML =
      `<span class="leg-title">${escapeHtml(measure.label)}</span>` +
      measure.legend
        .map((s) => `<span class="leg-item"><span class="leg-swatch" style="background:${s.swatch}"></span>${escapeHtml(s.label)}</span>`)
        .join('');
  };
  paintLegend();

  loadGeo()
    .then((geo) => {
      layer = L.geoJSON(geo, {
        style: (f) => style(String(f?.properties?.code)),
        onEachFeature: (f, lyr) => {
          const code = String(f.properties?.code);
          const l = data.byCode.get(code);
          const nm = l?.name ?? f.properties?.name ?? code;
          lyr.bindTooltip(
            `<strong>${escapeHtml(nm)}</strong> ${l ? escapeHtml(stateAbbr(l.state)) : ''}<br>${escapeHtml(measure.label)}: <b>${measure.fmt(l ? measure.get(l) : null)}</b>`,
            { sticky: true, className: 'map-tip' },
          );
          lyr.on({
            mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#0f172a' }),
            mouseout: () => layer && layer.resetStyle(lyr),
            click: () => l && ctx.openLga(code),
          });
        },
      }).addTo(map);

      const b = layer.getBounds();
      const fit = () => {
        map.invalidateSize();
        if (b.isValid() && canvas.clientHeight > 50) map.fitBounds(b, { padding: [10, 10] });
      };
      const ro = new ResizeObserver(() => {
        if (canvas.clientHeight > 50) {
          fit();
          ro.disconnect();
        }
      });
      ro.observe(canvas);
      setTimeout(fit, 350);
    })
    .catch(() => {
      canvas.innerHTML = '<div class="error-box">Could not load the map boundaries.</div>';
    });

  root.querySelector('[data-role="measure"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-m]');
    if (!btn) return;
    const m = MEASURES.find((x) => x.key === btn.getAttribute('data-m'));
    if (!m) return;
    measure = m;
    root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('active', b === btn));
    paintLegend();
    if (layer) {
      layer.eachLayer((lyr) => {
        const code = String((lyr as unknown as { feature: GeoJSON.Feature }).feature.properties?.code);
        const l = data.byCode.get(code);
        (lyr as L.Path).setStyle(style(code));
        (lyr as L.Layer).unbindTooltip();
        const nm = l?.name ?? code;
        (lyr as L.Layer).bindTooltip(
          `<strong>${escapeHtml(nm)}</strong> ${l ? escapeHtml(stateAbbr(l.state)) : ''}<br>${escapeHtml(measure.label)}: <b>${measure.fmt(l ? measure.get(l) : null)}</b>`,
          { sticky: true, className: 'map-tip' },
        );
      });
    }
  });
}

function sfmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${formatPercent(v)}`;
}
function sfmtRate(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}/1k`;
}
function seqLegend(max: number, base: string, unit: string, labels?: string[]): Array<{ swatch: string; label: string }> {
  if (labels) return labels.map((lab, i) => ({ swatch: seqColour((i / (labels.length - 1)) * 6.2, 6.2, base), label: lab }));
  return [0, 0.25, 0.5, 0.75, 1].map((t) => ({ swatch: seqColour(t * max, max, base), label: t === 0 ? '0' : t === 1 ? `${max}${unit}` : '' }));
}
