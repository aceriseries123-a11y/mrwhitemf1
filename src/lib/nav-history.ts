/**
 * nav-history.ts — fetch real NAV history from mfapi.in for a single scheme.
 *
 * mfapi.in is a community mirror of AMFI's daily NAV file with full history.
 * No API key. Returns up to ~20Y of daily NAVs per scheme.
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

function parseDDMMYYYY(s: string): number {
  // "12-06-2026"
  const [dd, mm, yyyy] = s.split("-");
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
}

export async function fetchNavHistory(schemeCode: string): Promise<NavHistory> {
  const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`, {
    signal: AbortSignal.timeout(20_000),
  });
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
  if (!json.data || json.data.length === 0) {
    throw new Error("NAV history empty — scheme may be inactive");
  }
  // mfapi.in returns newest first; we want oldest first
  const series: NavPoint[] = [];
  for (let i = json.data.length - 1; i >= 0; i--) {
    const row = json.data[i];
    const nav = parseFloat(row.nav);
    if (!isFinite(nav) || nav <= 0) continue;
    const t = parseDDMMYYYY(row.date);
    if (!isFinite(t)) continue;
    series.push({ t, d: new Date(t).toISOString().slice(0, 10), nav });
  }
  return {
    schemeCode: String(json.meta.scheme_code),
    schemeName: json.meta.scheme_name,
    fundHouse: json.meta.fund_house,
    schemeType: json.meta.scheme_type,
    schemeCategory: json.meta.scheme_category,
    series,
  };
}

export function useNavHistory(schemeCode: string | undefined) {
  return useQuery({
    queryKey: ["nav-history", schemeCode],
    queryFn: () => fetchNavHistory(schemeCode!),
    enabled: !!schemeCode,
    staleTime: 12 * 60 * 60 * 1000, // 12h — NAV publishes once daily
    retry: 1,
  });
}
