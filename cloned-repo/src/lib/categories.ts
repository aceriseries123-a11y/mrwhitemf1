/**
 * categories.ts
 *
 * AUDIT FIX — P1
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: `if (category.includes("large cap"))` style matching.
 *         Failed for Debt sub-categories, Retirement, Children, Multi Asset,
 *         FoF, Banking & PSU, Dynamic Bond, Corporate Bond, etc.
 *
 * AFTER:  Exhaustive map keyed on the exact AMFI category strings from
 *         NAVAll.txt, normalised to a canonical QuantFundCategory enum.
 *         An "Unknown" bucket catches anything not yet mapped.
 *
 * Canonical categories align with the separate ranking leaderboards required
 * by the audit: Large Cap, Mid Cap, Small Cap, Flexi Cap, Debt, Hybrid,
 * ELSS, International, Gold, Index.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Canonical category enum ─────────────────────────────────────────────────

export const QUANTFUND_CATEGORIES = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "Multi Cap",
  "Large & Mid Cap",
  "ELSS",
  "Focused",
  "Sectoral / Thematic",
  "Dividend Yield",
  // Hybrid
  "Aggressive Hybrid",
  "Conservative Hybrid",
  "Balanced Advantage",
  "Arbitrage",
  "Multi Asset",
  // Debt
  "Liquid",
  "Overnight",
  "Ultra Short Duration",
  "Low Duration",
  "Short Duration",
  "Medium Duration",
  "Medium to Long Duration",
  "Long Duration",
  "Dynamic Bond",
  "Corporate Bond",
  "Credit Risk",
  "Banking & PSU",
  "Gilt",
  "Gilt 10Y",
  "Floater",
  "Money Market",
  // Index / ETF
  "Index Fund",
  "ETF",
  // International
  "International / FoF",
  // Gold
  "Gold",
  // Solution-oriented
  "Retirement",
  "Children",
  // Other
  "Unknown",
] as const;

export type QuantFundCategory = (typeof QUANTFUND_CATEGORIES)[number];

// ─── Broad grouping for leaderboard tabs ─────────────────────────────────────

export type BroadCategory =
  | "Equity"
  | "Debt"
  | "Hybrid"
  | "Index / ETF"
  | "International"
  | "Gold"
  | "Solution-Oriented"
  | "Other";

export const BROAD_CATEGORY_MAP: Record<QuantFundCategory, BroadCategory> = {
  "Large Cap": "Equity",
  "Mid Cap": "Equity",
  "Small Cap": "Equity",
  "Flexi Cap": "Equity",
  "Multi Cap": "Equity",
  "Large & Mid Cap": "Equity",
  ELSS: "Equity",
  Focused: "Equity",
  "Sectoral / Thematic": "Equity",
  "Dividend Yield": "Equity",
  "Aggressive Hybrid": "Hybrid",
  "Conservative Hybrid": "Hybrid",
  "Balanced Advantage": "Hybrid",
  Arbitrage: "Hybrid",
  "Multi Asset": "Hybrid",
  Liquid: "Debt",
  Overnight: "Debt",
  "Ultra Short Duration": "Debt",
  "Low Duration": "Debt",
  "Short Duration": "Debt",
  "Medium Duration": "Debt",
  "Medium to Long Duration": "Debt",
  "Long Duration": "Debt",
  "Dynamic Bond": "Debt",
  "Corporate Bond": "Debt",
  "Credit Risk": "Debt",
  "Banking & PSU": "Debt",
  Gilt: "Debt",
  "Gilt 10Y": "Debt",
  Floater: "Debt",
  "Money Market": "Debt",
  "Index Fund": "Index / ETF",
  ETF: "Index / ETF",
  "International / FoF": "International",
  Gold: "Gold",
  Retirement: "Solution-Oriented",
  Children: "Solution-Oriented",
  Unknown: "Other",
};

// ─── AMFI raw string → QuantFundCategory ────────────────────────────────────
//
// Keys are the exact strings that appear inside the parentheses of section
// headers in NAVAll.txt, e.g.:
//   "Equity Scheme - Large Cap Fund" → "Large Cap"
//
// All lowercase comparison is done at lookup time (see classify() below).

const AMFI_CATEGORY_MAP: Record<string, QuantFundCategory> = {
  // ── Equity ────────────────────────────────────────────────────────────────
  "equity scheme - large cap fund": "Large Cap",
  "equity scheme - mid cap fund": "Mid Cap",
  "equity scheme - small cap fund": "Small Cap",
  "equity scheme - flexi cap fund": "Flexi Cap",
  "equity scheme - multi cap fund": "Multi Cap",
  "equity scheme - large & mid cap fund": "Large & Mid Cap",
  "equity scheme - elss": "ELSS",
  "equity scheme - focused fund": "Focused",
  "equity scheme - sectoral/ thematic": "Sectoral / Thematic",
  "equity scheme - sectoral/thematic funds": "Sectoral / Thematic",
  "equity scheme - dividend yield fund": "Dividend Yield",

  // ── Hybrid ────────────────────────────────────────────────────────────────
  "hybrid scheme - aggressive hybrid fund": "Aggressive Hybrid",
  "hybrid scheme - conservative hybrid fund": "Conservative Hybrid",
  "hybrid scheme - balanced advantage fund": "Balanced Advantage",
  "hybrid scheme - dynamic asset allocation or balanced advantage fund":
    "Balanced Advantage",
  "hybrid scheme - arbitrage fund": "Arbitrage",
  "hybrid scheme - multi asset allocation fund": "Multi Asset",

  // ── Debt ─────────────────────────────────────────────────────────────────
  "debt scheme - liquid fund": "Liquid",
  "debt scheme - overnight fund": "Overnight",
  "debt scheme - ultra short duration fund": "Ultra Short Duration",
  "debt scheme - low duration fund": "Low Duration",
  "debt scheme - short duration fund": "Short Duration",
  "debt scheme - medium duration fund": "Medium Duration",
  "debt scheme - medium to long duration fund": "Medium to Long Duration",
  "debt scheme - long duration fund": "Long Duration",
  "debt scheme - dynamic bond": "Dynamic Bond",
  "debt scheme - corporate bond fund": "Corporate Bond",
  "debt scheme - credit risk fund": "Credit Risk",
  "debt scheme - banking and psu fund": "Banking & PSU",
  "debt scheme - banking and psu debt fund": "Banking & PSU",
  "debt scheme - gilt fund": "Gilt",
  "debt scheme - gilt fund with 10 year constant duration": "Gilt 10Y",
  "debt scheme - floater fund": "Floater",
  "debt scheme - money market fund": "Money Market",

  // ── Index / ETF ──────────────────────────────────────────────────────────
  "other scheme - index funds": "Index Fund",
  "other scheme - index funds/etfs": "Index Fund",
  "other scheme - etfs": "ETF",
  "other scheme - exchange traded fund": "ETF",
  "other scheme - fund of funds investing overseas": "International / FoF",
  "other scheme - fund of funds (domestic)": "International / FoF",
  "other scheme - gold etf": "Gold",

  // ── Solution-Oriented ────────────────────────────────────────────────────
  "solution oriented scheme - retirement fund": "Retirement",
  "solution oriented scheme - children's fund": "Children",
};

// ─── Public classifier ────────────────────────────────────────────────────────

/**
 * Maps an AMFI raw category string (as parsed from NAVAll.txt) to a canonical
 * QuantFundCategory.  Returns "Unknown" for unrecognised categories rather than
 * throwing, so new AMFI categories degrade gracefully.
 */
export function classifyAMFICategory(rawCategory: string): QuantFundCategory {
  const key = rawCategory.trim().toLowerCase();
  return AMFI_CATEGORY_MAP[key] ?? "Unknown";
}

/**
 * Returns the broad grouping for a QuantFundCategory — used to drive the
 * leaderboard tab structure.
 */
export function broadCategory(cat: QuantFundCategory): BroadCategory {
  return BROAD_CATEGORY_MAP[cat];
}

// ─── Leaderboard groupings (for separate rankings) ───────────────────────────
//
// Rankings MUST NOT mix equity and debt, or different risk profiles.
// Each entry in this list gets its own ranked leaderboard.

export const EQUITY_LEADERBOARD_CATEGORIES: QuantFundCategory[] = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "Multi Cap",
  "Large & Mid Cap",
  "ELSS",
  "Focused",
  "Sectoral / Thematic",
];

export const HYBRID_LEADERBOARD_CATEGORIES: QuantFundCategory[] = [
  "Aggressive Hybrid",
  "Conservative Hybrid",
  "Balanced Advantage",
  "Multi Asset",
];

export const DEBT_LEADERBOARD_CATEGORIES: QuantFundCategory[] = [
  "Liquid",
  "Overnight",
  "Ultra Short Duration",
  "Low Duration",
  "Short Duration",
  "Medium Duration",
  "Medium to Long Duration",
  "Long Duration",
  "Dynamic Bond",
  "Corporate Bond",
  "Credit Risk",
  "Banking & PSU",
  "Gilt",
  "Gilt 10Y",
  "Floater",
  "Money Market",
];

// ─── Professional category colour palette ─────────────────────────────────────
// Each canonical category gets a unique brand colour used across all pages
// for consistent visual identity. Hex values intentionally distinct.

export const CATEGORY_COLORS: Record<QuantFundCategory, string> = {
  // Equity
  "Large Cap":               "#3B82F6",   // Blue-500
  "Mid Cap":                 "#8B5CF6",   // Violet-500
  "Small Cap":               "#F59E0B",   // Amber-500
  "Flexi Cap":               "#10B981",   // Emerald-500
  "Multi Cap":               "#06B6D4",   // Cyan-500
  "Large & Mid Cap":         "#6366F1",   // Indigo-500
  "ELSS":                    "#EF4444",   // Red-500
  "Focused":                 "#F97316",   // Orange-500
  "Sectoral / Thematic":     "#84CC16",   // Lime-500
  "Dividend Yield":          "#EC4899",   // Pink-500
  // Hybrid
  "Aggressive Hybrid":       "#14B8A6",   // Teal-500
  "Conservative Hybrid":     "#78716C",   // Stone-500
  "Balanced Advantage":      "#A855F7",   // Purple-500
  "Arbitrage":               "#64748B",   // Slate-500
  "Multi Asset":             "#0EA5E9",   // Sky-500
  // Debt
  "Liquid":                  "#94A3B8",   // Slate-400
  "Overnight":               "#CBD5E1",   // Slate-300
  "Ultra Short Duration":    "#7DD3FC",   // Sky-300
  "Low Duration":            "#6EE7B7",   // Emerald-300
  "Short Duration":          "#4ADE80",   // Green-400
  "Medium Duration":         "#86EFAC",   // Green-300
  "Medium to Long Duration": "#FCA5A5",   // Red-300
  "Long Duration":           "#F87171",   // Red-400
  "Dynamic Bond":            "#FCD34D",   // Amber-300
  "Corporate Bond":          "#FDBA74",   // Orange-300
  "Credit Risk":             "#F9A8D4",   // Pink-300
  "Banking & PSU":           "#C4B5FD",   // Violet-300
  "Gilt":                    "#A5B4FC",   // Indigo-300
  "Gilt 10Y":                "#818CF8",   // Indigo-400
  "Floater":                 "#67E8F9",   // Cyan-300
  "Money Market":            "#BAE6FD",   // Sky-200
  // Index / ETF
  "Index Fund":              "#0D9488",   // Teal-600
  "ETF":                     "#0891B2",   // Cyan-600
  // International / Gold
  "International / FoF":     "#7C3AED",   // Violet-600
  "Gold":                    "#CA8A04",   // Yellow-600
  // Solution-Oriented
  "Retirement":              "#BE185D",   // Pink-700
  "Children":                "#B45309",   // Amber-700
  // Unknown
  "Unknown":                 "#6B7280",   // Gray-500
};

/** Returns the professional brand colour for a category. */
export function categoryColor(cat: QuantFundCategory | string): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? "#6B7280";
}
