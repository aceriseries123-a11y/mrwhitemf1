/**
 * fund-store.ts — Shared in-memory store for the current browser session.
 *
 * Survives SPA route changes because module-level state persists as long as
 * the tab is open.  Dashboard writes here; Rankings / Screener / Fund Detail
 * read from here — no re-fetch, no loading spinner if Dashboard ran first.
 *
 * Subscription system: call subscribeToRankedList(fn) to be notified whenever
 * the ranked list is updated.  Returns an unsubscribe function.
 */

import type { NavPoint } from "./nav-history";
import type { EngineMetrics, EngineScoreResult } from "./scoring-engine";

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

// ─── Full ranked list (populated by Dashboard's 7-pillar engine scoring) ──────

/**
 * One entry per Direct-Growth fund, sorted by finalScore descending.
 *
 * Fields:
 *   fundScore       — pure quality 0–100, category-relative percentile
 *   finalScore      — fundScore × 90% + confidenceScore × 10% (primary display)
 *   confidenceScore — 0–100, penalises short-history funds
 *   rating          — "Elite" | "Excellent" | "Strong" | "Above Average" | "Average" | "Weak" | "Avoid"
 *   ratingColor     — tailwind text-* class matching the rating band
 *   categoryRank    — 1-based rank within poolCategory (by finalScore)
 *   metrics         — full 7-pillar EngineMetrics for detail pages
 *   pillars         — per-pillar breakdown (null until scored)
 */
export interface RankedFund {
  schemeCode: string;
  schemeName: string;
  amc: string;
  nav: number;
  category: string;
  poolCategory: string;
  // Engine scoring (category-relative, 7-pillar)
  fundScore:       number | null;
  finalScore:      number | null;
  confidenceScore: number | null;
  rating:          string | null;
  ratingColor:     string | null;
  categoryRank:    number | null;
  metrics: EngineMetrics;
  pillars: EngineScoreResult["pillars"] | null;
}

// Per-category lists — merged and re-sorted into fullRankedList on every update
const categoryListsStore = new Map<string, RankedFund[]>();
let fullRankedList: RankedFund[] = [];
type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Merge a newly-scored category into the global ranked list.
 * Called by Dashboard's engine computation useEffect after each category is processed.
 * Re-sorts the global list by finalScore descending and notifies all subscribers.
 */
export function mergeCategoryIntoStore(cat: string, funds: RankedFund[]): void {
  categoryListsStore.set(cat, funds);
  const all: RankedFund[] = [];
  for (const list of categoryListsStore.values()) all.push(...list);
  all.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
  fullRankedList = all;
  listeners.forEach((fn) => fn());
}

/**
 * Replace the full ranked list directly and notify all subscribers.
 * Use mergeCategoryIntoStore instead when updating per-category.
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
