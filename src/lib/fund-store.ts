/**
 * fund-store.ts — Shared in-memory store for the current browser session.
 *
 * Survives SPA route changes because module-level state persists as long as
 * the tab is open.  Dashboard writes here; Rankings / Screener / Fund Detail
 * read from here — no re-fetch, no loading spinner if Dashboard ran first.
 */

import type { NavPoint } from "./nav-history";
import type { FundMetrics } from "./fund-metrics";

// ─── NAV series store ────────────────────────────────────────────────────────

const navStore = new Map<string, NavPoint[]>();

/** Store a fund's NAV series. Called by Dashboard as each fetch resolves. */
export function storeSeries(code: string, series: NavPoint[]): void {
  if (series.length > 0) navStore.set(code, series);
}

/** Retrieve a stored NAV series, or undefined if not yet fetched. */
export function getSeries(code: string): NavPoint[] | undefined {
  return navStore.get(code);
}

/** Number of funds whose NAV series are stored. */
export function storedCount(): number {
  return navStore.size;
}

// ─── Full ranked list (Dashboard Table 1 — all funds, all categories) ────────

/**
 * One entry per Direct-Growth fund, sorted by Advanced Score descending.
 * Dashboard writes this progressively; Rankings reads it instantly on mount.
 */
export interface RankedFund {
  schemeCode: string;
  schemeName: string;
  amc: string;
  nav: number;
  category: string;
  poolCategory: string;
  advScore: number | null;
  metrics: FundMetrics;
  calmar: number | null;
}

let fullRankedList: RankedFund[] = [];

/** Replace the full ranked list. Called by Dashboard after each scoring pass. */
export function setFullRankedList(list: RankedFund[]): void {
  fullRankedList = list;
}

/** Get the current full ranked list. Empty until Dashboard has run. */
export function getFullRankedList(): RankedFund[] {
  return fullRankedList;
}

/** Number of funds in the full ranked list. */
export function rankedCount(): number {
  return fullRankedList.length;
}
