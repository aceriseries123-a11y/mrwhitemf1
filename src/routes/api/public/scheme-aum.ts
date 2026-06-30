import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum — Kuvera AUM lookup by ISIN
 *
 * GET /api/public/scheme-aum?funds=CODE:ISIN_A|ISIN_B,CODE2:ISIN_C,...
 *
 * Both ISINs per fund tried IN PARALLEL (not sequential) — cuts worst-case
 * latency from 16s (sequential 8s timeouts) to 8s.
 *
 * Cloudflare Workers subrequest budget: 50/invocation.
 * MAX_FUNDS=24: 24×2 parallel Kuvera fetches = 48 subreqs, safely under 50.
 *
 * Returns: { [schemeCode]: aum_cr }  (crores, integer)
 */

type Cached = { at: number; cr: number | null };
const cache = new Map<string, Cached>();
const TTL = 24 * 60 * 60 * 1000;
const MAX_FUNDS = 24;
const TIMEOUT = 6000;

function ft(p: Promise<Response>): Promise<Response> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<Response>((_, r) => { t = setTimeout(() => r(new Error("t")), TIMEOUT); }),
  ]).finally(() => clearTimeout(t));
}

async function kuvera(isin: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(isin);
  if (hit && now - hit.at < TTL) return hit.cr;
  let cr: number | null = null;
  try {
    const r = await ft(fetch(`https://mf.captnemo.in/kuvera/${isin}`, {
      redirect: "follow", headers: { "User-Agent": "QuantFund/1" },
    }));
    if (r.ok) {
      const arr = await r.json() as Array<{ aum?: number | string }>;
      if (Array.isArray(arr) && arr[0]) {
        const v = Number(arr[0].aum);
        if (isFinite(v) && v > 0) cr = Math.round(v / 100);
      }
    }
  } catch { /* ignore */ }
  cache.set(isin, { at: now, cr });
  return cr;
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const funds = (url.searchParams.get("funds") || "")
          .split(",").map(s => s.trim()).filter(Boolean)
          .map(e => {
            const [code, isinStr] = e.split(":");
            if (!code || !isinStr) return null;
            const isins = isinStr.split("|").filter(i => i.startsWith("INF"));
            return isins.length ? { code: code.trim(), isins } : null;
          })
          .filter((x): x is { code: string; isins: string[] } => x !== null)
          .slice(0, MAX_FUNDS);

        // Both ISINs per fund in PARALLEL — first non-null wins
        const results = await Promise.all(funds.map(async f => {
          const [r1, r2] = await Promise.all(f.isins.map(kuvera));
          return [f.code, r1 ?? r2 ?? null] as const;
        }));

        const map: Record<string, number> = {};
        for (const [code, cr] of results) if (cr != null) map[code] = cr;

        return Response.json(map, {
          headers: { "Cache-Control": "public, max-age=43200", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
