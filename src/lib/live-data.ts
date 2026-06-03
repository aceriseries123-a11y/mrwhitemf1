/**
 * live-data.ts
 *
 * AUDIT FIX — P0
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: Silent fallback to 10 curated funds when AMFI load fails.
 *         This produced misleading rankings from a tiny, hand-picked universe.
 *
 * AFTER:  Hard failure on AMFI unavailability.
 *         The UI must show an explicit error state; never silently degrade.
 *
 * Data source priority:
 *   1. AMFI NAVAll  → https://www.amfiindia.com/spages/NAVAll.txt
 *   2. MFAPI mirror → https://api.mfapi.in/mf  (fallback ONLY for individual
 *                     fund lookups, NOT for the scheme universe)
 *
 * Universe target: 4,128+ AMFI schemes, filtered to 1,500–2,500 active,
 * categorisable schemes with adequate NAV history (≥ 252 trading days ≈ 1 yr).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AMFIScheme {
  schemeCode: string;
  schemeName: string;
  isin: string | null;
  nav: number;
  date: string; // "DD-MMM-YYYY"
  amc: string;
  category: string; // raw AMFI category string
  schemeType: string; // "Open Ended Schemes" | "Close Ended Schemes" | etc.
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Proxied through our own origin to avoid browser CORS on amfiindia.com.
// See src/routes/api/public/amfi-navall.ts for the edge proxy implementation.
const AMFI_NAV_URL = "/api/public/amfi-navall";

/**
 * Minimum NAV history rows required before a fund is included in rankings.
 * Approximately 1 year of trading data.
 */
export const MIN_NAV_HISTORY_DAYS = 252;

// ─── AMFI NAVAll Parser ───────────────────────────────────────────────────────

/**
 * Parses the raw AMFI NAVAll.txt flat file.
 *
 * File format (semicolon-delimited, sections headed by AMC name):
 *   Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;
 *   Scheme Name;Net Asset Value;Date
 *
 * Section headers look like:
 *   Open Ended Schemes(Debt Scheme - Banking and PSU Fund)
 *   Aditya Birla Sun Life Mutual Fund
 *
 * THROWS if the file is empty, malformed, or contains fewer than 100 schemes
 * (a proxy for a truncated or error response from AMFI).
 */
function parseAMFINavAll(raw: string): AMFIScheme[] {
  const lines = raw.split("\n").map((l) => l.trim());

  if (lines.length < 200) {
    throw new Error(
      `AMFI NAVAll parse error: received only ${lines.length} lines — ` +
        "likely a truncated or error response. Refusing to use partial data.",
    );
  }

  const schemes: AMFIScheme[] = [];

  let currentAMC = "";
  let currentSchemeType = "";
  let currentCategory = "";

  for (const line of lines) {
    if (!line || line.startsWith("Scheme Code")) continue;

    // ── Section header: scheme type + category ──────────────────────────────
    // e.g. "Open Ended Schemes(Debt Scheme - Banking and PSU Fund)"
    const typeMatch = line.match(
      /^(Open Ended Schemes|Close Ended Schemes|Interval Fund|Exchange Traded Fund)\((.+)\)$/i,
    );
    if (typeMatch) {
      currentSchemeType = typeMatch[1].trim();
      currentCategory = typeMatch[2].trim();
      continue;
    }

    // ── AMC name line (no semicolons, not a data row) ────────────────────────
    if (!line.includes(";") && line.length > 3) {
      currentAMC = line;
      continue;
    }

    // ── Data row ─────────────────────────────────────────────────────────────
    const parts = line.split(";");
    if (parts.length < 6) continue;

    const [schemeCode, isin1, , schemeName, navStr, date] = parts;

    const nav = parseFloat(navStr);
    if (!schemeCode || isNaN(nav) || nav <= 0) continue;

    schemes.push({
      schemeCode: schemeCode.trim(),
      schemeName: schemeName.trim(),
      isin: isin1?.trim() || null,
      nav,
      date: date?.trim() ?? "",
      amc: currentAMC,
      category: currentCategory,
      schemeType: currentSchemeType,
    });
  }

  if (schemes.length < 100) {
    throw new Error(
      `AMFI NAVAll parse error: only ${schemes.length} valid schemes parsed. ` +
        "Expected 4,000+. Refusing to rank on partial universe.",
    );
  }

  return schemes;
}

// ─── Loader — HARD FAILURE, no silent fallback ───────────────────────────────

/**
 * Loads the full AMFI scheme universe.
 *
 * ⚠️  INTENTIONALLY THROWS on any failure.
 *
 * Rationale: A silent fallback to a curated list of 10 funds produces rankings
 * that are statistically invalid and misleading to investors.  QuantFund's
 * core promise is accuracy — we must never show rankings derived from a
 * non-representative sample without making that unmistakably clear to users.
 *
 * The caller (React Query) will surface this as an error state.  The UI layer
 * is responsible for showing a clear "Data unavailable" message rather than
 * degraded/fake rankings.
 */
export async function loadAMFISchemes(): Promise<AMFIScheme[]> {
  let response: Response;

  try {
    response = await fetch(AMFI_NAV_URL, {
      // Short timeout — fail fast rather than hang
      signal: AbortSignal.timeout(15_000),
    });
  } catch (networkErr) {
    throw new Error(
      `AMFI NAVAll fetch failed (network): ${(networkErr as Error).message}. ` +
        "Rankings are unavailable until AMFI is reachable.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `AMFI NAVAll HTTP ${response.status} ${response.statusText}. ` +
        "Rankings are unavailable.",
    );
  }

  const text = await response.text();
  // parseAMFINavAll throws on bad data — let it propagate
  return parseAMFINavAll(text);
}

// ─── React Query hook ─────────────────────────────────────────────────────────

export function useAMFISchemes() {
  return useQuery({
    queryKey: ["amfi-schemes"],
    queryFn: loadAMFISchemes,
    staleTime: 4 * 60 * 60 * 1000, // NAV updates once daily; 4 h is fine
    retry: 2,
    // DO NOT set a fallbackData / placeholderData here.
    // If the query is in error state, the UI must show the error.
  });
}

// ─── Active scheme filter ─────────────────────────────────────────────────────

/**
 * Filters the full universe to only schemes suitable for ranking:
 *   • Open-ended (so NAV history is meaningful)
 *   • Recognised category (not unknown/miscellaneous)
 *   • Growth plan preferred (avoids double-counting dividend variants)
 *
 * Returns the filtered list — caller is responsible for fetching NAV history
 * and further filtering by MIN_NAV_HISTORY_DAYS.
 */
export function filterActiveSchemes(schemes: AMFIScheme[]): AMFIScheme[] {
  return schemes.filter((s) => {
    if (s.schemeType !== "Open Ended Schemes") return false;
    if (!s.category || s.category.toLowerCase() === "other") return false;

    // Keep Growth / IDCW-Reinvestment plans; drop pure dividend-payout variants
    const nameUpper = s.schemeName.toUpperCase();
    if (
      nameUpper.includes("DIVIDEND") &&
      !nameUpper.includes("REINVESTMENT")
    ) {
      return false;
    }

    return true;
  });
}
