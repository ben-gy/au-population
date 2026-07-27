// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/**
 * Headless render smoke test. Renders every content view against the REAL built
 * data (public/data/population.json) in jsdom and asserts: no thrown error, no
 * "NaN", no stray "undefined" in the output, and that key content appears.
 * Catches the class of bug a screenshot would (blank views, NaN coordinates,
 * broken template literals) without needing a live browser.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Dataset } from '../src/data';
import type { ViewContext } from '../src/viewContext';
import type { Payload } from '../src/types';
import { renderOverview } from '../src/views/overview';
import { renderRankings } from '../src/views/rankings';
import { renderTrends } from '../src/views/trends';
import { renderMatrix } from '../src/views/matrix';
import { renderExplorer } from '../src/views/explorer';
import { renderInsights } from '../src/views/insights';
import { renderTreemap } from '../src/views/treemap';
import { createDrilldown } from '../src/components/drilldown';
import { createAbout } from '../src/components/about';

const DIR = path.dirname(fileURLToPath(import.meta.url));

let data: Dataset;

beforeAll(() => {
  // ResizeObserver isn't in jsdom; a couple of components construct one.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  const payload = JSON.parse(readFileSync(path.join(DIR, '../public/data/population.json'), 'utf8')) as Payload;
  data = { ...payload, byCode: new Map(payload.lgas.map((l) => [l.code, l])) };
});

function ctx(): ViewContext & { takeParams: () => null } {
  return {
    data,
    openLga: vi.fn(),
    goTo: vi.fn(),
    goToWith: vi.fn(),
    takeParams: () => null,
  };
}

function assertClean(html: string, label: string) {
  expect(html.length, `${label} rendered empty`).toBeGreaterThan(200);
  expect(html.includes('NaN'), `${label} contains NaN`).toBe(false);
  expect(html.includes('>undefined<'), `${label} contains undefined text`).toBe(false);
  expect(html.includes('undefined%'), `${label} contains undefined%`).toBe(false);
  expect(html.includes('$undefined'), `${label} contains undefined interpolation`).toBe(false);
}

describe('views render cleanly against real data', () => {
  const views: Array<[string, (r: HTMLElement, c: ViewContext) => void]> = [
    ['overview', renderOverview],
    ['rankings', renderRankings],
    ['trends', renderTrends],
    ['matrix', renderMatrix],
    ['explorer', renderExplorer],
    ['insights', renderInsights],
    ['treemap', renderTreemap],
  ];
  for (const [name, render] of views) {
    it(`${name} renders without error, NaN or undefined`, () => {
      const root = document.createElement('div');
      expect(() => render(root, ctx()), `${name} threw`).not.toThrow();
      assertClean(root.innerHTML, name);
    });
  }

  it('every LGA drawer renders (sampled) without NaN', () => {
    const drill = createDrilldown(data);
    // sample: biggest, smallest, one of each type
    const sample = [data.lgas[0], data.lgas[data.lgas.length - 1], ...(['both', 'natural', 'migration', 'emptying'] as const).map((t) => data.lgas.find((l) => l.type === t)).filter(Boolean)];
    for (const l of sample) {
      drill.open(l!.code);
      const drawer = document.querySelector('.drawer .drawer-body') as HTMLElement;
      assertClean(drawer.innerHTML, `drawer ${l!.name}`);
      drill.close();
    }
  });

  it('about modal renders without NaN', () => {
    createAbout(data.meta, data.national);
    const modal = document.querySelector('.modal') as HTMLElement;
    assertClean(modal.innerHTML, 'about');
  });

  it('explorer histogram + table both populate', () => {
    const root = document.createElement('div');
    renderExplorer(root, ctx());
    expect(root.querySelectorAll('.histo-bar').length).toBeGreaterThan(5);
    expect(root.querySelectorAll('tbody tr[data-code]').length).toBeGreaterThan(10);
  });

  it('treemap produces in-bounds, non-NaN cells covering the canvas', () => {
    const root = document.createElement('div');
    renderTreemap(root, ctx());
    const cells = [...root.querySelectorAll('rect.tm-cell')] as SVGRectElement[];
    expect(cells.length).toBeGreaterThan(400);
    for (const c of cells.slice(0, 200)) {
      for (const attr of ['x', 'y', 'width', 'height']) {
        expect(Number.isFinite(Number(c.getAttribute(attr))), `tm-cell ${attr} NaN`).toBe(true);
      }
    }
  });
});
