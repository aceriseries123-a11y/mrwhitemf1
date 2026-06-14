/**
 * engine-cache.ts — Shared localStorage cache for 7-pillar EngineMetrics.
 *
 * Why this exists:
 *   Dashboard loads and caches the old 6-factor FundMetrics in its own
 *   localStorage key. Rankings and fund-detail pages use the newer 7-pillar
 *   EngineMetrics which require benchmark-relative calculations and peer context.
 *   This module gives all pages a shared, date-keyed cache so that once any page
 *   computes EngineMetrics for a fund, every other page gets them instantly —
 *   no re-fetch, no loading spinner.
 *
 * Key design:
 *   • Keyed by today's date — auto-expires daily (NAV publishes once/day)
 *   • Old keys are cleaned up on read
 *   • Save is best-effort (quota exceeded → no-op)
 *
 * v2: added ret1d, rollingReturn3yAvg, rollingReturn5yAvg, rollingReturn7yAvg
 */

import type { EngineMetrics } from "./scoring-engine";

const TODAY = new Date().toISOString().slice(0, 10);
const KEY = `qf-engine-v2-${TODAY}`;
const KEY_PREFIX = "qf-engine-v";

/** Load all cached EngineMetrics for today. Returns empty Map if none. */
export function loadEngineCache(): Map<string, EngineMetrics> {
  const map = new Map<string, EngineMetrics>();
  try {
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX) && k !== KEY) staleKeys.push(k);
    }
    for (const k of staleKeys) localStorage.removeItem(k);

    const raw = localStorage.getItem(KEY);
    if (!raw) return map;
    const obj = JSON.parse(raw) as Record<string, EngineMetrics>;
    for (const [code, m] of Object.entries(obj)) map.set(code, m);
  } catch { /* no-op */ }
  return map;
}

/** Merge a new entry (or map of entries) into the persistent cache. */
export function saveEngineCache(
  entries: Map<string, EngineMetrics> | Record<string, EngineMetrics>,
): void {
  try {
    const existing = loadEngineCache();
    const toAdd = entries instanceof Map ? entries : new Map(Object.entries(entries));
    for (const [k, v] of toAdd) existing.set(k, v);
    const obj: Record<string, EngineMetrics> = {};
    for (const [k, v] of existing) obj[k] = v;
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch { /* quota exceeded — no-op */ }
}
