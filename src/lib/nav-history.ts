/**
 * nav-history.ts — NAV history fetchers for QuantFund.
 *
 * Two fetch modes:
 *   fetchNavHistory(code)       — single fund, direct to mfapi.in via concurrency
 *                                 limiter. Used by fund detail pages, screener, etc.
 *   fetchNavHistoryBatch(codes) — sends codes to the server-side /api/public/nav-batch
 *                                 endpoint, which fans out to mfapi.in in parallel and
 *                                 caches results for 12 h. Used by the dashboard for
 *                                 bulk scoring. Reduces 1,300+ browser requests to ~14.
 */

import { useQuery } from "@tanstack/react-query";

export interface NavPoint {
  /** JS timestamp (ms) — easier to chart than strings */
  t: number;
  /** ISO date YYYY-MM-DD */
  d: string;
  /** Net Asset Value (₹) */
  nav: number;
}

export interface NavHistory {
  schemeCode: string;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  /** Chronological ascending (oldest first) */
  series: NavPoint[];
}

export type NavBatchResult = Record<string, NavHistory | null>;

// ─── Concurrency limiter (single-fund path) ───────────────────────────────────
// Limits simultaneous direct mfapi.in fetches so fund-detail pages don't
// overwhelm the browser connection pool.

const MAX_CONCURRENT = 20;
let inFlight = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  if (waitQueue.length > 0) {
    waitQueue.shift()!();
  } else {
    inFlight--;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDDMMYYYY(s: string): number {
  const [dd, mm, yyyy] = s.split("-");
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
}

function parseRawSeries(
  data: Array<{ date: string; nav: string }>,
): NavPoint[] {
  const series: NavPoint[] = [];
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    const nav = parseFloat(row.nav);
    if (!isFinite(nav) || nav <= 0) continue;
    const t = parseDDMMYYYY(row.date);
    if (!isFinite(t)) continue;
    series.push({ t, d: new Date(t).toISOString().slice(0, 10), nav });
  }
  return series;
}

// ─── Single-fund fetch (direct) ───────────────────────────────────────────────

export async function fetchNavHistory(schemeCode: string): Promise<NavHistory> {
  await acquireSlot();
  try {
    const r = await fetch(
      `https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) throw new Error(`NAV history HTTP ${r.status}`);

    const json = (await r.json()) as {
      meta: {
        scheme_code: number;
        scheme_name: string;
        fund_house: string;
        scheme_type: string;
        scheme_category: string;
      };
      data: Array<{ date: string; nav: string }>;
    };

    if (!json.data?.length) {
      throw new Error("NAV history empty — scheme may be inactive");
    }

    return {
      schemeCode: String(json.meta.scheme_code),
      schemeName: json.meta.scheme_name,
      fundHouse: json.meta.fund_house,
      schemeType: json.meta.scheme_type,
      schemeCategory: json.meta.scheme_category,
      series: parseRawSeries(json.data),
    };
  } finally {
    releaseSlot();
  }
}

// ─── Batch fetch (via server proxy) ───────────────────────────────────────────
// Sends all codes to /api/public/nav-batch which fetches them in parallel
// server-side (no browser connection pool limit) and caches for 12 h.
// ~14 browser round-trips replaces ~1,340 — the key dashboard speed win.

export async function fetchNavHistoryBatch(
  schemeCodes: string[],
): Promise<NavBatchResult> {
  const r = await fetch("/api/public/nav-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes: schemeCodes }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`nav-batch HTTP ${r.status}`);

  const { results } = (await r.json()) as {
    results: Record<
      string,
      | {
          meta: {
            scheme_code: number;
            scheme_name: string;
            fund_house: string;
            scheme_type: string;
            scheme_category: string;
          };
          data: Array<{ date: string; nav: string }>;
        }
      | null
    >;
  };

  const out: NavBatchResult = {};
  for (const [code, raw] of Object.entries(results)) {
    if (!raw?.data?.length) {
      out[code] = null;
      continue;
    }
    out[code] = {
      schemeCode: String(raw.meta.scheme_code),
      schemeName: raw.meta.scheme_name,
      fundHouse: raw.meta.fund_house,
      schemeType: raw.meta.scheme_type,
      schemeCategory: raw.meta.scheme_category,
      series: parseRawSeries(raw.data),
    };
  }
  return out;
}

// ─── React Query hook (single fund) ───────────────────────────────────────────

export function useNavHistory(schemeCode: string | undefined) {
  return useQuery({
    queryKey: ["nav-history", schemeCode],
    queryFn: () => fetchNavHistory(schemeCode!),
    enabled: !!schemeCode,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}
