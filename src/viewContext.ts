// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
import type { Dataset } from './data';
import type { ViewId } from './types';

export interface ViewContext {
  data: Dataset;
  /** Open the per-LGA drill-down drawer. */
  openLga: (code: string) => void;
  /** Switch the active view tab (used for cross-view links). */
  goTo: (view: ViewId) => void;
  /** Optional payload for the target view (e.g. a filter for the Explorer). */
  goToWith: (view: ViewId, params: Record<string, string>) => void;
}
