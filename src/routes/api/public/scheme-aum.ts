import { createFileRoute } from "@tanstack/react-router";

// Per-scheme AUM via Kuvera (resolved by ISIN from mfapi.in).
// Values returned are approximate AUM in INR crores for the specific plan
// variant (direct/regular, growth/IDCW) keyed by AMFI scheme code.
//
// Flow per code:
//   1) GET https://api.mfapi.in/mf/{code}          -> meta.isin_growth
//   2) GET https://mf.captnemo.in/kuvera/{isin}    -> [{ aum }] (Kuvera, in lakhs)
//   3) crores = aum / 100
//
// Cached per-code in worker memory for 24h. Client passes ?codes=c1,c2,...

type Cached = { at: number; cr: number | null };
const cache = new Map<string, Cached>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODES = 60;

async function fetchAumCr(code: string): Promise<number | null> {
  try {
    const metaR = await fetch(`https://api.mfapi.in/mf/${code}`, {
      headers: { "User-Agent": "QuantFundTerminal/1.0" },
    });
    if (!metaR.ok) return null;
    const meta: { meta?: { isin_growth?: string | null } } = await metaR.json();
    const isin = meta?.meta?.isin_growth;
    if (!isin) return null;

    const kr = await fetch(`https://mf.captnemo.in/kuvera/${isin}`, {
      redirect: "follow",
      headers: { "User-Agent": "QuantFundTerminal/1.0" },
    });
    if (!kr.ok) return null;
    const arr = (await kr.json()) as Array<{ aum?: number }>;
    if (!Array.isArray(arr) || !arr.length) return null;
    const aumLakhs = Number(arr[0]?.aum);
    if (!Number.isFinite(aumLakhs) || aumLakhs <= 0) return null;
    // Kuvera publishes AUM in lakhs; convert to crores.
    return Math.round(aumLakhs / 100);
  } catch {
    return null;
  }
}

async function getAum(code: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(code);
  if (hit && now - hit.at < TTL_MS) return hit.cr;
  const cr = await fetchAumCr(code);
  cache.set(code, { at: now, cr });
  return cr;
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("codes") || "";
        const codes = Array.from(
          new Set(
            raw
              .split(",")
              .map(s => s.trim())
              .filter(s => /^\d{5,6}$/.test(s))
          )
        ).slice(0, MAX_CODES);

        const entries = await Promise.all(
          codes.map(async c => [c, await getAum(c)] as const)
        );
        const map: Record<string, number> = {};
        for (const [c, v] of entries) if (v != null) map[c] = v;

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
