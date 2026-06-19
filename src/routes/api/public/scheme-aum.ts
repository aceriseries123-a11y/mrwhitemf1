import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum — AUM lookup via Kuvera/captnemo
 *
 * Request format:
 *   ?funds=CODE1:ISIN_A|ISIN_B,CODE2:ISIN_C,...
 *
 * Each fund can carry up to 2 candidate ISINs (AMFI NAVAll col1 + col2 — the
 * "growth" ISIN isn't always in the same column for every scheme variant).
 * The server tries each candidate ISIN in order and uses the first that
 * returns a valid AUM. Response is keyed by schemeCode directly:
 *
 *   { "120503": 45821, "118989": 12044, ... }
 *
 * Kuvera endpoint: https://mf.captnemo.in/kuvera/{isin}
 * Returns array: [{ aum: <lakhs>, ... }]  → crores = round(lakhs / 100)
 *
 * In-memory cache per ISIN: TTL 24h.
 * Max 60 funds per request (each fund tries up to 2 ISINs = up to 120 fetches,
 * all run in parallel across funds AND across each fund's candidate list is
 * sequential-with-early-exit to avoid wasting a call once one ISIN succeeds).
 */

type Cached = { at: number; cr: number | null };
const isinCache = new Map<string, Cached>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FUNDS = 60;
const TIMEOUT_MS = 7000;

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([
    p,
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
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

async function getAumByIsinCached(isin: string): Promise<number | null> {
  const now = Date.now();
  const hit = isinCache.get(isin);
  if (hit && now - hit.at < TTL_MS) return hit.cr;
  const cr = await fetchAumByIsin(isin);
  isinCache.set(isin, { at: now, cr });
  return cr;
}

/** Try each candidate ISIN in order; stop at first success. */
async function resolveAumForFund(isins: string[]): Promise<number | null> {
  for (const isin of isins) {
    const cr = await getAumByIsinCached(isin);
    if (cr != null) return cr;
  }
  return null;
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
          funds.map(async f => [f.code, await resolveAumForFund(f.isins)] as const)
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
