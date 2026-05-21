// Legacy shim. All real data now lives in `src/lib/live-data.ts`.
// We keep this module so existing imports compile while routes transition.
//
// No hardcoded synthetic fund identifiers, random metrics, or AUM fabrication.

export type Category = string;

// AMFI SEBI-defined buckets used by category dropdowns.
export const CATEGORY_LIST: string[] = [
  "Large Cap", "Large & Mid Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap",
  "ELSS", "Focused", "Value/Contra", "Dividend Yield", "Sectoral/Thematic", "Equity Other",
  "Hybrid", "Debt", "Index/ETF", "Gold", "Silver", "International", "Solution Oriented", "Other",
];

export const AMC_LIST: string[] = [];
