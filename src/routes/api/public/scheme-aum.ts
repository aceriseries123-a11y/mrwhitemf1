import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum — AUM lookup via Kuvera/captnemo
 *
 * Client passes ISINs directly (already available from AMFI NAVAll.txt),
 * avoiding the mfapi.in lookup entirely. One HTTP call per ISIN vs two before.
 *
 * Two calling conventions (client can use either):
 *   ?isins=INF209K01YJ9,INF179K01BB8,...   → returns { [isin]: crores }
 *   ?codes=120503,120504,...               → legacy, needs ISIN map (slower)
 *
 * Preferred: use ?isins= so the server only needs one fetch per fund.
 *
 * Kuvera endpoint: https://mf.captnemo.in/kuvera/{isin}
 * Returns array: [{ aum: <lakhs>, ... }]
 * We convert lakhs → crores: crores = Math.round(aum / 100)
 *
 * In-memory cache per worker: TTL 24 h
 * Max 80 ISINs per request (resolved in parallel)
 */

type Cached = { at: number; cr: number | null };
const isinCache = new Map<string, Cached>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ISINS = 80;
const TIMEOUT_MS = 8000;

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([
    p,
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function fetchAumByIsin(isin: string): Promise<number | null> {
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

async function getAumByIsin(isin: string): Promise<number | null> {
  const now = Date.now();
  const hit = isinCache.get(isin);
  if (hit && now - hit.at < TTL_MS) return hit.cr;
  const cr = await fetchAumByIsin(isin);
  isinCache.set(isin, { at: now, cr });
  return cr;
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);

        // Preferred: client sends ISINs directly
        const rawIsins = url.searchParams.get("isins") || "";
        const isins = Array.from(
          new Set(
            rawIsins
              .split(",")
              .map(s => s.trim())
              .filter(s => s.length > 0 && s.startsWith("INF"))
          )
        ).slice(0, MAX_ISINS);

        if (isins.length === 0) {
          return Response.json({}, {
            headers: { "Cache-Control": "public, max-age=3600" },
          });
        }

        // Resolve all ISINs in parallel
        const results = await Promise.all(
          isins.map(async isin => {
            const cr = await getAumByIsin(isin);
            return [isin, cr] as const;
          })
        );

        const map: Record<string, number> = {};
        for (const [isin, cr] of results) {
          if (cr != null) map[isin] = cr;
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
