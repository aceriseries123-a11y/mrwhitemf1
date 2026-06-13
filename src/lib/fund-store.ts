/**
 * fund-store.ts — Shared in-memory NAV series store for the current browser session.
 *
 * Why this exists:
 *   Dashboard fetches NAV series for 1,000+ funds. Rankings, Screener, and Fund
 *   Detail pages need the same series but have no way to access Dashboard's
 *   in-memory state directly.  This module-level store bridges that gap — it
 *   survives SPA route changes because module state persists as long as the tab
 *   is open.
 *
 * How it's used:
 *   • Dashboard calls storeSeries() as each NAV fetch resolves.
 *   • Rankings / Screener / Fund Detail pass getSeries() as initialData to
 *     useQuery/useQueries — if warm, the query starts in "success" state
 *     immediately with zero network requests.
 */

import type { NavPoint } from "./nav-history";

const store = new Map<string, NavPoint[]>();

/** Store a fund's NAV series. Called by Dashboard as data arrives. */
export function storeSeries(code: string, series: NavPoint[]): void {
  if (series.length > 0) store.set(code, series);
}

/** Retrieve a stored NAV series, or undefined if not yet loaded. */
export function getSeries(code: string): NavPoint[] | undefined {
  return store.get(code);
}

/** Number of funds currently in the store. */
export function storedCount(): number {
  return store.size;
}
