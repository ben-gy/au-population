// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
/** Domain jargon, defined for a reader who knows nothing about demography. */
export interface GlossaryEntry {
  term: string;
  title: string;
  body: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  erp: {
    term: 'erp',
    title: 'Estimated Resident Population (ERP)',
    body:
      'The ABS’s official count of how many people usually live in an area on 30 June each year. It is built from the Census and updated annually using births, deaths and migration. Every population figure on this site is an ERP.',
  },
  lga: {
    term: 'lga',
    title: 'Local Government Area (LGA)',
    body:
      'A council area — the level of government that runs local services (roughly a city, shire or region). Australia has around 550 of them, and they are the geography this site uses. They vary enormously in size, from a few thousand people to over a million.',
  },
  natural: {
    term: 'natural',
    title: 'Natural increase',
    body:
      'Births minus deaths. When more babies are born than people die, natural increase is positive and the population grows on its own. When deaths outnumber births — common in ageing country towns — it is negative, and the area only grows if enough people move in.',
  },
  internal: {
    term: 'internal',
    title: 'Net internal migration',
    body:
      'People moving between places within Australia: arrivals from other parts of the country minus departures to them. It is zero-sum nationally — one area’s gain is exactly another’s loss — so it reshuffles where Australians live without adding to the national total.',
  },
  overseas: {
    term: 'overseas',
    title: 'Net overseas migration',
    body:
      'People arriving from overseas to live here minus those leaving to live abroad (on a 12-out-of-16-months rule). It is the largest engine of Australia’s growth and the most volatile — it collapsed below zero when the border closed in 2020–21 and rebounded to record highs afterwards.',
  },
  engine: {
    term: 'engine',
    title: 'The three growth engines',
    body:
      'Any area’s population change is the sum of three things: natural increase (births minus deaths), net internal migration (movement within Australia) and net overseas migration (arrivals from abroad). Separating them shows WHY a place is growing or shrinking, which a single growth number hides.',
  },
  rate: {
    term: 'rate',
    title: 'Rate per 1,000 residents',
    body:
      'A count divided by population, times 1,000, so places of very different sizes can be compared. A natural-increase rate of +10 means 10 more births than deaths for every 1,000 residents that year. Rates let a small town and a capital city sit on the same axis.',
  },
  intercensal: {
    term: 'intercensal',
    title: 'Why components don’t add up exactly',
    body:
      'Each Census, the ABS rebases the population and spreads the correction (the "intercensal difference") across earlier years. So natural increase plus net migration won’t always equal the exact year-on-year population change, especially in rebasing years. The gap is usually small.',
  },
};

export function glossaryTerm(term: string, label?: string): string {
  const entry = GLOSSARY[term];
  const text = label ?? entry?.title ?? term;
  return `<span class="glossary-link" data-term="${term}" tabindex="0" role="button">${text}</span>`;
}

export function infoIcon(term: string): string {
  return `<button class="info-icon" data-term="${term}" aria-label="What does this mean?" type="button">i</button>`;
}
