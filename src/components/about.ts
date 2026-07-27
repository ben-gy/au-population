// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { National, Meta } from '../types';
import { glossaryTerm } from '../glossary';
import { formatNumber } from '../utils/format';

/** About modal: what this is, where the data comes from, and what it cannot tell you. */
export function createAbout(meta: Meta, n: National): { open: () => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'About Population Change');

  const ratio = n.natural && n.netOverseas ? (n.netOverseas / n.natural).toFixed(1) : '—';
  modal.innerHTML = `
    <button class="modal-close" aria-label="Close">✕</button>
    <h2>About Population Change</h2>
    <p>
      This maps where Australia is growing and shrinking — all <strong>${formatNumber(meta.lgaCount)}</strong>
      ${glossaryTerm('lga', 'local government areas')} (councils) — and, more importantly, <em>why</em>. Every area’s
      change is split into the three ${glossaryTerm('engine', 'engines of growth')}:
      ${glossaryTerm('natural', 'natural increase')} (births minus deaths),
      ${glossaryTerm('internal', 'net internal migration')} (people moving within Australia) and
      ${glossaryTerm('overseas', 'net overseas migration')}.
    </p>
    <p>
      It exists because a single growth number hides the mechanism. In ${n.latestYear}, net overseas migration added
      <strong>${formatNumber(n.netOverseas)}</strong> people nationally — about <strong>${ratio}×</strong> the
      <strong>${formatNumber(n.natural)}</strong> from natural increase. A booming outer-suburban corridor, an ageing
      coastal “sea-change” town and an emptying wheat-belt shire can all show similar headline growth for completely
      different reasons.
    </p>

    <h3>Where the data comes from</h3>
    <ul>
      <li>
        <strong>ABS Regional Population</strong> — Estimated Resident Population by LGA (2001→${n.latestYear}) and the
        components of population change (births, deaths, internal and overseas migration). Published once a year.
      </li>
      <li><strong>ABS ASGS 2024</strong> — the LGA boundaries for the map (simplified for the web, never hand-drawn).</li>
    </ul>

    <h3>How often it updates</h3>
    <p>
      An automated pipeline rebuilds the site once a year, matching the ABS’s annual Regional Population release. The
      reference year shown throughout is <strong>${n.latestYear}</strong> (populations are as at 30 June).
    </p>

    <h3>Important limits — please read</h3>
    <ul>
      <li>
        <strong>${glossaryTerm('internal', 'Net internal migration is zero-sum')}.</strong> Nationally it always sums
        to zero — every person who moves out of one council moves into another. It reshuffles where Australians live,
        it doesn’t add to the total.
      </li>
      <li>
        <strong>${glossaryTerm('intercensal', 'Components don’t always add up exactly')}.</strong> After each Census
        the ABS rebases the population and spreads the correction across years, so natural increase plus net migration
        won’t perfectly equal the year-on-year change, especially in rebasing years.
      </li>
      <li>
        <strong>${glossaryTerm('rate', 'Rates are per 1,000 residents')}</strong> so a small town and a capital city
        can be compared. Rate rankings apply a small population floor so a handful of people in a tiny area can’t
        produce a wild rate.
      </li>
      <li>
        This measures where people <em>live</em> (usual residence), not where they were born, and counts residents, not
        citizens. “Overseas migration” includes anyone moving here long-term — including international students.
      </li>
    </ul>

    <h3>Licence</h3>
    <p>
      ABS data is published under CC BY 4.0. This site is an independent project and is not affiliated with the ABS.
    </p>
  `;

  document.body.append(overlay, modal);
  const close = () => {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  };
  const open = () => {
    overlay.classList.add('open');
    modal.classList.add('open');
    modal.scrollTop = 0;
    (modal.querySelector('.modal-close') as HTMLElement)?.focus();
  };
  overlay.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });
  return { open, close };
}
