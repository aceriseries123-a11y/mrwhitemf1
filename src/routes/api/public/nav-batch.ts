/**
 * nav-batch.ts — server-side batch NAV fetcher + 12h in-memory cache.
 *
 * POST /api/public/nav-batch
 * Body:    { codes: string[] }         — up to 200 scheme codes per request
 * Returns: { results: Record<code, MfApiResponse | null> }
 *
 * Why this exists:
 *   The browser can only open ~6 TCP connections per hostname. Fetching 1,300+
 *   individual NAV histories from mfapi.in takes 60–90 s in the browser.
 *   The server has no such limit — it can fan out 30+ parallel requests and
 *   cache results for the rest of the day. This reduces perceived load time
 *   from ~60 s to ~3–5 s on first visit, and near-instant on repeat visits.
 */

import { createFileRoute } from "@tanstack/react-router";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MfDataPoint { date: string; nav: string; }
interface MfMeta {
  scheme_code: number;
  scheme_name: string;
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
}
export interface MfApiResponse { meta: MfMeta; data: MfDataPoint[]; }
interface CacheEntry { at: number; payload: MfApiResponse; }

// ─── Module-level cache ───────────────────────────────────────────────────────
// Persists across requests within the same server/worker instance.
// On Cloudflare Workers this lives for the lifetime of the isolate (~hours).

const fundCache = new Map<string, CacheEntry>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ─── Server-side concurrency limiter ─────────────────────────────────────────
// 30 concurrent outbound requests — much higher than the browser's 6 per host.
// Prevents hammering mfapi.in while still being aggressive.

const MAX_PARALLEL = 30;
let active = 0;
const pending: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) { active++; return Promise.resolve(); }
  return new Promise((r) => pending.push(r));
}
function release(): void {
  if (pending.length) { pending.shift()!(); } else { active--; }
}

// ─── Single fund fetch ────────────────────────────────────────────────────────

async function fetchOne(code: string): Promise<MfApiResponse | null> {
  await acquire();
  try {
    const r = await fetch(
      `https://api.mfapi.in/mf/${encodeURIComponent(code)}`,
      {
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "QuantFund/1.0" },
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as MfApiResponse;
    if (!j?.data?.length) return null;
    return j;
  } catch {
    return null;
  } finally {
    release();
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/public/nav-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let codes: string[] = [];
        try {
          const body = (await request.json()) as { codes?: string[] };
          if (Array.isArray(body?.codes)) {
            codes = body.codes
              .filter((s): s is string => typeof s === "string" && /^\d{5,6}$/.test(s))
              .slice(0, 200);
          }
        } catch { /* empty body */ }

        if (codes.length === 0) {
          return new Response(JSON.stringify({ results: {} }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const now = Date.now();
        const results: Record<string, MfApiResponse | null> = {};
        const toFetch: string[] = [];

        // Serve cached entries immediately
        for (const code of codes) {
          const hit = fundCache.get(code);
          if (hit && now - hit.at < CACHE_TTL) {
            results[code] = hit.payload;
          } else {
            toFetch.push(code);
          }
        }

        // Fetch all uncached in parallel — server has no connection-pool cap
        if (toFetch.length > 0) {
          const settled = await Promise.allSettled(
            toFetch.map((code) =>
              fetchOne(code).then((data) => ({ code, data })),
            ),
          );
          for (const s of settled) {
            if (s.status === "fulfilled") {
              const { code, data } = s.value;
              results[code] = data;
              if (data) fundCache.set(code, { at: now, payload: data });
            }
          }
        }

        return new Response(JSON.stringify({ results }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Cache-Hits": String(codes.length - toFetch.length),
            "X-Fetched": String(toFetch.length),
          },
        });
      },
    },
  },
});
