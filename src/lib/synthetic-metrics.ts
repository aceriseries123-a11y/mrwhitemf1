/**
 * synthetic-metrics.ts
 *
 * Deterministic pseudo-metrics for the full AMFI scheme universe.
 *
 * ⚠️  Until per-scheme NAV history is wired through the live scoring engine
 * (see scoring.ts), we generate STABLE, REPRODUCIBLE numbers from the
 * scheme code so the UI can demonstrate the full set of ratios and a
 * multi-factor composite score across all 4,000+ funds.
 *
 * These are NOT predictions and NOT live values. They are shaped like real
 * output so the surface area, sorting, filtering and ranking behaviour is
 * exactly what the production engine will plug into.
 *
 * Composite QuantFund Score (preview, 8 factors):
 *   Return Consistency     20
 *   3Y CAGR                15
 *   5Y CAGR                15
 *   Sharpe                 12
 *   Sortino                10
 *   Max Drawdown (inverted)10
 *   Alpha vs Benchmark      8
 *   Expense Ratio (inverted)5
 *   Downside Protection     5
 *                          ───
 *                          100
 */

import type { AMFIScheme } from "./live-data";
import type { QuantFundCategory } from "./categories";

// ─── Deterministic hash → [0, 1) ──────────────────────────────────────────────

function hash01(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) * 16777619;
    h = h >>> 0;
  }
  return (h % 100000) / 100000;
}

function rand(seed: string, salt: string, lo: number, hi: number): number {
  return lo + hash01(seed + ":" + salt) * (hi - lo);
}

// Category profile drives mean / vol so a Liquid fund doesn't show 35% CAGR
const CATEGORY_PROFILE: Record<
  string,
  { ret: [number, number]; vol: [number, number]; ddBias: number }
> = {
  "Large Cap": { ret: [8, 22], vol: [12, 18], ddBias: -18 },
  "Mid Cap": { ret: [10, 32], vol: [16, 24], ddBias: -28 },
  "Small Cap": { ret: [8, 38], vol: [20, 30], ddBias: -36 },
  "Flexi Cap": { ret: [9, 24], vol: [13, 20], ddBias: -22 },
  "Multi Cap": { ret: [9, 25], vol: [13, 21], ddBias: -22 },
  "Large & Mid Cap": { ret: [9, 26], vol: [14, 22], ddBias: -24 },
  ELSS: { ret: [9, 24], vol: [14, 21], ddBias: -22 },
  Focused: { ret: [8, 26], vol: [14, 22], ddBias: -24 },
  "Sectoral / Thematic": { ret: [6, 36], vol: [18, 30], ddBias: -34 },
  "Dividend Yield": { ret: [7, 18], vol: [11, 17], ddBias: -18 },
  "Aggressive Hybrid": { ret: [7, 18], vol: [9, 14], ddBias: -16 },
  "Conservative Hybrid": { ret: [5, 11], vol: [4, 7], ddBias: -7 },
  "Balanced Advantage": { ret: [6, 14], vol: [6, 10], ddBias: -10 },
  Arbitrage: { ret: [4, 7.5], vol: [0.5, 1.2], ddBias: -1 },
  "Multi Asset": { ret: [7, 16], vol: [7, 11], ddBias: -12 },
  Liquid: { ret: [5, 7.5], vol: [0.1, 0.4], ddBias: -0.2 },
  Overnight: { ret: [5, 7], vol: [0.05, 0.2], ddBias: -0.1 },
  "Ultra Short Duration": { ret: [5.5, 8], vol: [0.4, 1], ddBias: -0.5 },
  "Low Duration": { ret: [5.5, 8], vol: [0.6, 1.5], ddBias: -0.8 },
  "Short Duration": { ret: [5.5, 8.5], vol: [1, 2.5], ddBias: -1.5 },
  "Medium Duration": { ret: [5.5, 9], vol: [2, 4], ddBias: -3 },
  "Medium to Long Duration": { ret: [5, 9], vol: [3, 6], ddBias: -5 },
  "Long Duration": { ret: [5, 10], vol: [4, 8], ddBias: -7 },
  "Dynamic Bond": { ret: [5, 9], vol: [2, 5], ddBias: -4 },
  "Corporate Bond": { ret: [5.5, 8.5], vol: [1, 3], ddBias: -2 },
  "Credit Risk": { ret: [5, 10], vol: [2, 5], ddBias: -5 },
  "Banking & PSU": { ret: [5.5, 8.5], vol: [1, 3], ddBias: -2 },
  Gilt: { ret: [5, 10], vol: [3, 7], ddBias: -6 },
  "Gilt 10Y": { ret: [5, 10], vol: [4, 8], ddBias: -7 },
  Floater: { ret: [5.5, 8], vol: [0.8, 2], ddBias: -1 },
  "Money Market": { ret: [5.5, 7.5], vol: [0.3, 0.8], ddBias: -0.4 },
  "Index Fund": { ret: [8, 20], vol: [12, 18], ddBias: -20 },
  ETF: { ret: [8, 22], vol: [12, 20], ddBias: -22 },
  "International / FoF": { ret: [4, 24], vol: [14, 24], ddBias: -28 },
  Gold: { ret: [6, 18], vol: [10, 18], ddBias: -16 },
  Retirement: { ret: [7, 16], vol: [8, 14], ddBias: -14 },
  Children: { ret: [7, 16], vol: [8, 14], ddBias: -14 },
  Unknown: { ret: [5, 15], vol: [5, 15], ddBias: -10 },
};

export interface PreviewMetrics {
  ret1Y: number; // %
  ret3Y: number; // %
  ret5Y: number; // %
  stdDev: number; // annualised %
  sharpe: number;
  sortino: number;
  maxDrawdown: number; // negative %
  alpha: number; // % vs benchmark
  expenseRatio: number; // %
  aumCr: number; // ₹ crore
  consistency: number; // 0-100 rolling 1Y positive rate
  downsideProtection: number; // 0-100
  qfScore: number; // 0-100 composite
}

export function previewMetrics(
  scheme: AMFIScheme,
  category: QuantFundCategory,
): PreviewMetrics {
  const seed = scheme.schemeCode;
  const profile = CATEGORY_PROFILE[category] ?? CATEGORY_PROFILE.Unknown;

  const ret3Y = rand(seed, "r3", profile.ret[0], profile.ret[1]);
  const ret1Y = ret3Y + rand(seed, "r1d", -6, 8);
  const ret5Y = ret3Y + rand(seed, "r5d", -3, 3);
  const stdDev = rand(seed, "vol", profile.vol[0], profile.vol[1]);
  const rfr = 6.8; // ~India 10Y G-Sec
  const sharpe = (ret3Y - rfr) / Math.max(0.1, stdDev);
  const downsideDev = stdDev * rand(seed, "dvol", 0.55, 0.85);
  const sortino = (ret3Y - rfr) / Math.max(0.1, downsideDev);
  const maxDrawdown = profile.ddBias * rand(seed, "dd", 0.55, 1.15);
  const alpha = rand(seed, "a", -4, 6);
  const expenseRatio = rand(seed, "er", 0.18, 2.1);
  const aumCr = Math.round(rand(seed, "aum", 25, 60000));
  const consistency = rand(seed, "cons", 40, 95);
  const downsideProtection = rand(seed, "dp", 35, 92);

  // ── Composite QuantFund Score (8 factors, weights as in header) ──────────
  // Each factor is mapped to a 0-1 quality within reasonable bounds.
  const qConsist = clamp01((consistency - 40) / 55);
  const qRet3 = clamp01((ret3Y - profile.ret[0]) / (profile.ret[1] - profile.ret[0]));
  const qRet5 = clamp01((ret5Y - profile.ret[0]) / (profile.ret[1] - profile.ret[0]));
  const qSharpe = clamp01((sharpe + 0.5) / 3);
  const qSortino = clamp01((sortino + 0.5) / 4);
  const qDD = clamp01(1 - Math.abs(maxDrawdown) / Math.abs(profile.ddBias * 1.4 || 1));
  const qAlpha = clamp01((alpha + 4) / 10);
  const qExp = clamp01(1 - (expenseRatio - 0.18) / 1.92);
  const qDP = clamp01((downsideProtection - 35) / 57);

  const qfScore =
    qConsist * 20 +
    qRet3 * 15 +
    qRet5 * 15 +
    qSharpe * 12 +
    qSortino * 10 +
    qDD * 10 +
    qAlpha * 8 +
    qExp * 5 +
    qDP * 5;

  return {
    ret1Y,
    ret3Y,
    ret5Y,
    stdDev,
    sharpe,
    sortino,
    maxDrawdown,
    alpha,
    expenseRatio,
    aumCr,
    consistency,
    downsideProtection,
    qfScore: Math.round(qfScore * 10) / 10,
  };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
