/**
 * fund-store.ts — Shared in-memory store for the current browser session.
 *
 * Survives SPA route changes because module-level state persists as long as
 * the tab is open.  Dashboard writes here; Rankings / Screener / Fund Detail
 * read from here — no re-fetch, no loading spinner if Dashboard ran first.
 *
 * Subscription system: call subscribeToRankedList(fn) to be notified whenever
 * setFullRankedList is called.  Returns an unsubscribe function.
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
 * Dashboard writes this at scoring milestones; subscribers (Rankings, etc.)
 * are notified immediately so they re-render without polling or re-fetching.
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
type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Replace the full ranked list and notify all subscribers.
 * Called by Dashboard after each scoring milestone.
 */
export function setFullRankedList(list: RankedFund[]): void {
  fullRankedList = list;
  listeners.forEach((fn) => fn());
}

/** Get the current full ranked list. Empty until Dashboard has run. */
export function getFullRankedList(): RankedFund[] {
  return fullRankedList;
}

/**
 * Subscribe to ranked list updates.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 *
 * @example
 *   const [list, setList] = useState(getFullRankedList);
 *   useEffect(() => subscribeToRankedList(() => setList(getFullRankedList())), []);
 */
export function subscribeToRankedList(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Number of funds in the full ranked list. */
export function rankedCount(): number {
  return fullRankedList.length;
}
