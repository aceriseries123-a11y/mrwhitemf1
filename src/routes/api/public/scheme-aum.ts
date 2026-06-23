import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum — AUM lookup: Kuvera (by ISIN) → mfdata.in bulk (by AMFI code)
 *
 * Request format:
 *   ?funds=CODE1:ISIN_A|ISIN_B,CODE2:ISIN_C,...
 *
 * Resolution order per fund:
 *   1. Kuvera/captnemo by ISIN col1  (early exit on success)
 *   2. Kuvera/captnemo by ISIN col2  (early exit on success)
 *   3. mfdata.in bulk POST by scheme code (only for funds still unresolved
 *      after both Kuvera attempts — batched in a SINGLE subrequest for all
 *      remaining funds in the request, not one per fund)
 *
 * Kuvera endpoint:  https://mf.captnemo.in/kuvera/{isin}
 *   → [{aum: <lakhs>}]   crores = round(lakhs / 100)
 *   Only covers funds listed on Kuvera's platform (curated, ~82% of AMFI).
 *
 * mfdata.in endpoint: POST https://mfdata.in/api/v1/schemes/bulk
 *   → {status, data: [{scheme_code, aum_cr}]}
 *   Covers 14,000+ schemes; aum_cr is already in crores.
 *   NOTE: the single-scheme GET /api/v1/schemes/{code} does NOT include
 *   aum_cr — only the bulk/list endpoints expose it. That was the bug in
 *   the previous implementation (silent null on every mfdata call).
 *
 * *** Cloudflare Workers subrequest budget ***
 * Free plan: hard cap of 50 subrequests per invocation.
 * Per-fund breakdown:
 *   Step 1 & 2: up to 2 Kuvera fetches per fund (sequential, early-exit)
 *   Step 3: 1 bulk POST for ALL remaining funds in the batch (not per-fund)
 *
 * Worst case: N funds × 2 Kuvera attempts + 1 mfdata bulk = 2N + 1 subs.
 * With MAX_FUNDS = 20: up to 20×2 + 1 = 41 subrequests. Safe under 50.
 * (Average case is much less since ~82% of funds resolve on Kuvera step 1.)
 *
 * In-memory cache: TTL 24h per ISIN (Kuvera) and per code (mfdata).
 */

type Cached = { at: number; cr: number | null };
const kuveraCache = new Map<string, Cached>(); // key = isin
const mfdataCache = new Map<string, Cached>(); // key = schemeCode string
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FUNDS = 20; // 20×2 Kuvera + 1 mfdata bulk = 41 subs max, safely under 50
const TIMEOUT_MS = 8000;

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<Response>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); }),
  ]).finally(() => clearTimeout(t));
}

// ─── Source 1: Kuvera / captnemo (by ISIN) ───────────────────────────────────

async function fetchKuvera(isin: string): Promise<number | null> {
  const now = Date.now();
  const hit = kuveraCache.get(isin);
  if (hit && now - hit.at < TTL_MS) return hit.cr;

  let cr: number | null = null;
  try {
    const r = await withTimeout(
      fetch(`https://mf.captnemo.in/kuvera/${isin}`, {
        redirect: "follow",
        headers: { "User-Agent": "QuantFundTerminal/1.0" },
      }),
      TIMEOUT_MS
    );
    if (r.ok) {
      const arr = (await r.json()) as Array<{ aum?: number | string }>;
      if (Array.isArray(arr) && arr.length > 0) {
        const lakhs = Number(arr[0]?.aum);
        if (Number.isFinite(lakhs) && lakhs > 0) cr = Math.round(lakhs / 100);
      }
    }
  } catch { /* timeout/network */ }

  kuveraCache.set(isin, { at: now, cr });
  return cr;
}

// ─── Source 2: mfdata.in bulk POST (by AMFI scheme codes) ───────────────────
//
// The single-scheme GET /api/v1/schemes/{code} does NOT expose aum_cr.
// Only the BULK POST endpoint returns aum_cr in its response array.
// One POST call resolves ALL unresolved codes in the batch → 1 subrequest.

async function fetchMfdataBulk(codes: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (codes.length === 0) return result;
  try {
    const r = await withTimeout(
      fetch("https://mfdata.in/api/v1/schemes/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "QuantFundTerminal/1.0",
          "Accept": "application/json",
        },
        body: JSON.stringify({ scheme_codes: codes.map(Number) }),
      }),
      TIMEOUT_MS
    );
    if (!r.ok) return result;
    const json = (await r.json()) as {
      status?: string;
      data?: Array<{ scheme_code?: number | string; aum_cr?: number | string }>;
    };
    if (json?.status !== "success" || !Array.isArray(json.data)) return result;
    for (const item of json.data) {
      const cr = Number(item.aum_cr);
      const code = String(item.scheme_code ?? "");
      if (code && Number.isFinite(cr) && cr > 0) result.set(code, Math.round(cr));
    }
  } catch { /* timeout/network */ }
  return result;
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("funds") || "";

        const funds = raw
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(entry => {
            const [code, isinStr] = entry.split(":");
            if (!code || !isinStr) return null;
            const isins = isinStr.split("|").filter(i => i.startsWith("INF"));
            return { code: code.trim(), isins };
          })
          .filter((x): x is { code: string; isins: string[] } => x != null)
          .slice(0, MAX_FUNDS);

        if (funds.length === 0) {
          return Response.json({}, { headers: { "Cache-Control": "public, max-age=3600" } });
        }

        // Phase 1: try Kuvera for all funds in parallel (early exit per fund)
        const now = Date.now();
        const resolved = new Map<string, number>();
        const unresolved: string[] = []; // codes that need mfdata.in fallback

        await Promise.all(funds.map(async f => {
          // Check mfdata cache first to skip Kuvera if we already have a result
          const mfHit = mfdataCache.get(f.code);
          if (mfHit && now - mfHit.at < TTL_MS && mfHit.cr != null) {
            resolved.set(f.code, mfHit.cr);
            return;
          }

          // Try Kuvera ISINs
          for (const isin of f.isins) {
            const cr = await fetchKuvera(isin);
            if (cr != null) { resolved.set(f.code, cr); return; }
          }

          // Mark as unresolved → needs mfdata fallback
          unresolved.push(f.code);
        }));

        // Phase 2: ONE bulk call to mfdata.in for all unresolved funds
        if (unresolved.length > 0) {
          const mfResults = await fetchMfdataBulk(unresolved);
          const nowMf = Date.now();
          for (const code of unresolved) {
            const cr = mfResults.get(code) ?? null;
            mfdataCache.set(code, { at: nowMf, cr });
            if (cr != null) resolved.set(code, cr);
          }
        }

        const map: Record<string, number> = {};
        for (const [code, cr] of resolved) map[code] = cr;

        return Response.json(map, {
          headers: {
            "Cache-Control": "public, max-age=43200",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
