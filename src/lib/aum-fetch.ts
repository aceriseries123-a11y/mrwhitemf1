/**
 * aum-fetch.ts — Direct browser-to-source AUM fetching
 *
 * KEY ARCHITECTURE CHANGE: both upstream sources have CORS enabled for all
 * origins, so the browser calls them DIRECTLY — no Cloudflare Worker proxy,
 * no Worker subrequest budget, no Worker wall-clock/CPU limits involved at
 * all. This was the actual root cause of "stuck in between": every previous
 * version routed both sources through our own Worker, which has a hard
 * 50-subrequest-per-invocation cap (Cloudflare Free plan) and CPU/wall-clock
 * limits — large batches of fund lookups kept silently failing or timing
 * out mid-invocation with zero visible error.
 *
 * Source A — Kuvera/captnemo, by ISIN:
 *   https://mf.captnemo.in/kuvera/{isin}  →  [{ aum: <lakhs> }]
 *   CORS: Access-Control-Allow-Origin: * (confirmed, documented)
 *
 * Source B — mfdata.in, by AMFI scheme code:
 *   https://mfdata.in/api/v1/schemes/{code}  →  { status, data: { aum_cr } }
 *   CORS: Access-Control-Allow-Origin: * (confirmed, documented)
 *
 * Both fetched in parallel for every fund (whichever source resolves first
 * is used — no sequential fallback chain). Concurrency is capped by a
 * browser-appropriate pool size (way higher than Cloudflare's subrequest
 * cap allowed, since there's no Worker in the loop anymore).
 */

export interface AumLookupInput {
  schemeCode: string;
  isin: string | null;
  isin2: string | null;
}

const TIMEOUT_MS = 6000;
const CONCURRENCY = 16; // browser connection pool — no Worker subrequest limit applies here

function withTimeout<T>(p: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(null); });
  });
}

async function fetchKuveraDirect(isin: string): Promise<number | null> {
  const res = await withTimeout(fetch(`https://mf.captnemo.in/kuvera/${isin}`));
  if (!res || !res.ok) return null;
  try {
    const arr = await res.json() as Array<{ aum?: number | string }>;
    if (!Array.isArray(arr) || !arr[0]) return null;
    const lakhs = Number(arr[0].aum);
    return isFinite(lakhs) && lakhs > 0 ? Math.round(lakhs / 100) : null;
  } catch {
    return null;
  }
}

async function fetchMfdataDirect(code: string): Promise<number | null> {
  const res = await withTimeout(fetch(`https://mfdata.in/api/v1/schemes/${code}`));
  if (!res || !res.ok) return null;
  try {
    const json = await res.json() as { status?: string; data?: { aum_cr?: number | string } };
    if (json?.status !== "success" || !json.data) return null;
    const cr = Number(json.data.aum_cr);
    return isFinite(cr) && cr > 0 ? Math.round(cr) : null;
  } catch {
    return null;
  }
}

/** Resolve one fund: both Kuvera ISINs + mfdata.in code, all racing in parallel. */
async function resolveOne(f: AumLookupInput): Promise<number | null> {
  const isins = [f.isin, f.isin2].filter((x): x is string => !!x && x.startsWith("INF"));
  const attempts: Promise<number | null>[] = [
    ...isins.map(fetchKuveraDirect),
    fetchMfdataDirect(f.schemeCode),
  ];
  const results = await Promise.all(attempts);
  return results.find((r) => r != null) ?? null;
}

/**
 * Fetch AUM for a list of funds with bounded concurrency, calling a progress
 * callback after every successful resolution so the UI can update live.
 * Returns a Map of schemeCode → AUM (crores). Funds with no result are
 * simply absent from the map (not included as null).
 */
export async function fetchAumForFunds(
  funds: AumLookupInput[],
  onProgress?: (resolved: Map<string, number>) => void,
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  let cursor = 0;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < funds.length) {
      const f = funds[cursor++];
      const cr = await resolveOne(f);
      if (cr != null) {
        resolved.set(f.schemeCode, cr);
        onProgress?.(resolved);
      }
    }
  });

  await Promise.all(workers);
  return resolved;
}
