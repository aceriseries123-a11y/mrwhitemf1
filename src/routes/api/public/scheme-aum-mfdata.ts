import { createFileRoute } from "@tanstack/react-router";

/**
 * scheme-aum-mfdata — mfdata.in AUM lookup by AMFI scheme code
 *
 * GET /api/public/scheme-aum-mfdata?codes=119551,120503,...
 *
 * Uses mfdata.in GET /api/v1/schemes/{code} — the DETAIL endpoint.
 * Confirmed to return aum_cr: { "status":"success", "data": { "aum_cr": 34521.08 } }
 *
 * Each code = 1 subrequest. MAX_CODES=24 = 24 subrequests, safely under 50.
 * All codes resolved IN PARALLEL.
 *
 * This is a SEPARATE route from scheme-aum so both sources can be called
 * simultaneously from the client without competing for the same subrequest budget.
 *
 * Returns: { [schemeCode]: aum_cr }  (crores, integer)
 */

type Cached = { at: number; cr: number | null };
const cache = new Map<string, Cached>();
const TTL = 24 * 60 * 60 * 1000;
const MAX_CODES = 24;
const TIMEOUT = 6000;

function ft(p: Promise<Response>): Promise<Response> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<Response>((_, r) => { t = setTimeout(() => r(new Error("t")), TIMEOUT); }),
  ]).finally(() => clearTimeout(t));
}

async function mfdata(code: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(code);
  if (hit && now - hit.at < TTL) return hit.cr;
  let cr: number | null = null;
  try {
    const r = await ft(fetch(`https://mfdata.in/api/v1/schemes/${code}`, {
      headers: { "User-Agent": "QuantFund/1", "Accept": "application/json" },
    }));
    if (r.ok) {
      const json = await r.json() as {
        status?: string;
        data?: { aum_cr?: number | string } | Array<{ aum_cr?: number | string }>;
      };
      if (json?.status === "success" && json.data) {
        // Handle both object and array response shapes
        const d = Array.isArray(json.data) ? json.data[0] : json.data;
        const v = Number(d?.aum_cr);
        if (isFinite(v) && v > 0) cr = Math.round(v);
      }
    }
  } catch { /* ignore */ }
  cache.set(code, { at: now, cr });
  return cr;
}

export const Route = createFileRoute("/api/public/scheme-aum-mfdata")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const codes = (url.searchParams.get("codes") || "")
          .split(",").map(s => s.trim()).filter(s => /^\d{5,6}$/.test(s))
          .slice(0, MAX_CODES);

        const results = await Promise.all(codes.map(async c => [c, await mfdata(c)] as const));
        const map: Record<string, number> = {};
        for (const [c, cr] of results) if (cr != null) map[c] = cr;

        return Response.json(map, {
          headers: { "Cache-Control": "public, max-age=43200", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
