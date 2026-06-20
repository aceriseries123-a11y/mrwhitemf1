/**
 * aum-cache.ts — Persistent localStorage cache for fund AUM (₹ Cr).
 *
 * Why this exists:
 *   AUM is sourced from Kuvera (via captnemo mirror), which rate-limits
 *   under the burst of ~1,300+ funds' worth of lookups needed each session.
 *   Some funds fail to resolve on a given run purely due to transient
 *   rate-limiting, not because the data doesn't exist. Without a persistent
 *   cache, every full page reload re-fights the same rate limits and a
 *   different random subset of funds comes back empty each time.
 *
 *   This cache makes successful lookups STICK across reloads and across
 *   browser sessions (within the TTL window) — once a fund's AUM is
 *   resolved once, it's resolved for the rest of the day, and future runs
 *   only need to fetch the funds that are still genuinely missing.
 *
 * Key design:
 *   • TTL = 24h (AUM is a daily-disclosed figure, doesn't change intraday)
 *   • Keyed by schemeCode → { cr: number, at: timestamp }
 *   • Auto-prunes entries older than TTL on read
 *   • Save is best-effort (quota exceeded → no-op)
 */

const KEY = "qf-aum-cache-v1";
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedEntry {
  cr: number;
  at: number; // epoch ms
}

/** Load all non-expired cached AUM values. */
export function loadAumCache(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return map;
    const obj = JSON.parse(raw) as Record<string, CachedEntry>;
    const now = Date.now();
    let pruned = false;
    const fresh: Record<string, CachedEntry> = {};
    for (const [code, entry] of Object.entries(obj)) {
      if (now - entry.at < TTL_MS) {
        map.set(code, entry.cr);
        fresh[code] = entry;
      } else {
        pruned = true;
      }
    }
    if (pruned) localStorage.setItem(KEY, JSON.stringify(fresh));
  } catch { /* no-op */ }
  return map;
}

/** Merge new AUM values into the persistent cache (best-effort). */
export function saveAumCache(entries: Record<string, number> | Map<string, number>): void {
  try {
    const raw = localStorage.getItem(KEY);
    const existing: Record<string, CachedEntry> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const toAdd = entries instanceof Map ? entries : new Map(Object.entries(entries));
    for (const [code, cr] of toAdd) {
      if (cr != null) existing[code] = { cr, at: now };
    }
    localStorage.setItem(KEY, JSON.stringify(existing));
  } catch { /* quota exceeded — no-op */ }
}
