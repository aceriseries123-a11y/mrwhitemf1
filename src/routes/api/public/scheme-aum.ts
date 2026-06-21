import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum — AUM lookup with a two-source fallback chain
 *
 * Request format:
 *   ?funds=CODE1:ISIN_A|ISIN_B,CODE2:ISIN_C,...
 *
 * Source 1 — Kuvera (via captnemo mirror), by ISIN:
 *   https://mf.captnemo.in/kuvera/{isin}  →  [{ aum: <lakhs> }]
 *   Tries up to 2 candidate ISINs (AMFI NAVAll col1 + col2) per fund.
 *   Kuvera only lists funds it actually distributes — it does NOT cover
 *   every AMFI scheme, so a clean "not found" here is expected for a
 *   genuine subset of funds, not a failure.
 *
 * Source 2 — mfdata.in, by AMFI scheme code (fallback, tried only if
 * Source 1 returns nothing for a fund):
 *   https://mfdata.in/api/v1/schemes/{schemeCode}  →  { data: { aum_cr } }
 *   Broader coverage (14,000+ schemes via its own multi-source pipeline),
 *   keyed directly by AMFI code so no ISIN matching is needed at all.
 *
 * Each fund tries Source 1's ISINs first (early exit on first success),
 * then falls back to Source 2 only if still unresolved. Response is keyed
 * by schemeCode directly:
 *
 *   { "120503": 45821, "118989": 12044, ... }
 *
 * In-memory cache: TTL 24h, keyed per (source, identifier) pair so a
 * Source 1 miss and Source 2 hit are cached independently.
 *
 * *** CRITICAL: Cloudflare Workers subrequest limit ***
 * This app deploys on Cloudflare Workers. The Workers FREE plan hard-caps
 * EVERY invocation at 50 external subrequests — exceeding it throws
 * "Too many subrequests" and the ENTIRE invocation fails, silently
 * dropping every fund in that request. Each fund can now need up to 3
 * sequential fetches (2 Kuvera ISIN attempts + 1 mfdata.in fallback), so
 * MAX_FUNDS is kept low enough that 3× MAX_FUNDS stays safely under 50.
 */

type Cached = { at: number; cr: number | null };
const cache = new Map<string, Cached>(); // key: "kuvera:{isin}" or "mfdata:{code}"
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FUNDS = 14; // 14 funds × up to 3 fetches = ≤42 subrequests, safely under the 50 cap
const TIMEOUT_MS = 7000;

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function getCached(key: string, fetcher: () => Promise<number | null>): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.cr;
  const cr = await fetcher();
  cache.set(key, { at: now, cr });
  return cr;
}

// ─── Source 1: Kuvera (by ISIN) ────────────────────────────────────────────────

async function fetchAumFromKuvera(isin: string): Promise<number | null> {
  try {
    const r = await withTimeout(
      fetch(`https://mf.captnemo.in/kuvera/${isin}`, {
        redirect: "follow",
        headers: { "User-Agent": "QuantFundTerminal/1.0" },
      }),
      TIMEOUT_MS
    );
    if (!r.ok) return null;
    const arr = (await r.json()) as Array<{ aum?: number | string }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lakhs = Number(arr[0]?.aum);
    if (!Number.isFinite(lakhs) || lakhs <= 0) return null;
    return Math.round(lakhs / 100);
  } catch {
    return null;
  }
}

// ─── Source 2: mfdata.in (by AMFI scheme code) — fallback ────────────────────

async function fetchAumFromMfdata(schemeCode: string): Promise<number | null> {
  try {
    const r = await withTimeout(
      fetch(`https://mfdata.in/api/v1/schemes/${schemeCode}`, {
        headers: { "User-Agent": "QuantFundTerminal/1.0", "Accept": "application/json" },
      }),
      TIMEOUT_MS
    );
    if (!r.ok) return null;
    const json = (await r.json()) as { status?: string; data?: { aum_cr?: number | string } };
    if (json?.status !== "success" || !json.data) return null;
    const cr = Number(json.data.aum_cr);
    if (!Number.isFinite(cr) || cr <= 0) return null;
    return Math.round(cr);
  } catch {
    return null;
  }
}

/**
 * Resolve AUM for one fund: try Kuvera with each candidate ISIN (early exit
 * on first success), then fall back to mfdata.in by scheme code if Kuvera
 * had no record under any ISIN.
 */
async function resolveAumForFund(schemeCode: string, isins: string[]): Promise<number | null> {
  for (const isin of isins) {
    const cr = await getCached(`kuvera:${isin}`, () => fetchAumFromKuvera(isin));
    if (cr != null) return cr;
  }
  return getCached(`mfdata:${schemeCode}`, () => fetchAumFromMfdata(schemeCode));
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("funds") || "";

        // Parse "CODE:ISIN_A|ISIN_B,CODE2:ISIN_C" into [{code, isins}]
        const funds = raw
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(entry => {
            const [code, isinStr] = entry.split(":");
            if (!code || !isinStr) return null;
            const isins = isinStr.split("|").filter(i => i.startsWith("INF"));
            if (isins.length === 0) return null;
            return { code: code.trim(), isins };
          })
          .filter((x): x is { code: string; isins: string[] } => x != null)
          .slice(0, MAX_FUNDS);

        if (funds.length === 0) {
          return Response.json({}, { headers: { "Cache-Control": "public, max-age=3600" } });
        }

        // Resolve all funds in parallel; within each fund, ISINs tried sequentially
        // with early exit (usually only 1 fetch unless the first ISIN fails).
        const results = await Promise.all(
          funds.map(async f => [f.code, await resolveAumForFund(f.code, f.isins)] as const)
        );

        const map: Record<string, number> = {};
        for (const [code, cr] of results) {
          if (cr != null) map[code] = cr;
        }

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
