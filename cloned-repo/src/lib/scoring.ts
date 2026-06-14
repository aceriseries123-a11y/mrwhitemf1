/**
 * scoring.ts
 *
 * AUDIT FIX — P0
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: A weighted formula was labelled "AI Score" / "AI Ranking" /
 *         "AI Recommended Buys".  This is not AI — there is no ML model,
 *         LLM, or predictive component.  The mislabelling erodes trust.
 *
 * AFTER:  Renamed to "QuantFund Score".  The formula is unchanged but now:
 *   1. Named accurately
 *   2. Each component is exposed in the UI with its weight and raw value
 *   3. The methodology is documented here and linkable from the UI
 *
 * Scoring weights (QuantFund Score v1):
 *   Rolling Return Consistency   25%
 *   Sharpe Ratio                 20%
 *   Sortino Ratio                15%
 *   Max Drawdown                 15%
 *   Alpha vs Benchmark           10%
 *   Expense Ratio                 5%
 *   Downside Protection          10%
 *                               ────
 *                               100%
 *
 * All component scores are normalised 0–100 within each category peer group.
 * Cross-category comparisons are therefore INVALID — each leaderboard must
 * be category-scoped (see categories.ts).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  RISK_FREE_RATE_ANNUAL,
  riskFreeRateDaily,
  TRADING_DAYS_PER_YEAR,
} from "./risk-free-rate";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FundMetrics {
  schemeCode: string;
  /** Annualised CAGR over the primary evaluation period (5y preferred) */
  cagr5y: number | null;
  cagr3y: number | null;
  cagr1y: number | null;
  /** Annualised standard deviation of daily returns */
  stdDevAnnual: number | null;
  /** Annualised downside deviation (below 0) */
  downsideDevAnnual: number | null;
  /** Sharpe ratio: (CAGR - RFR) / stdDev */
  sharpe: number | null;
  /** Sortino ratio: (CAGR - RFR) / downsideDev */
  sortino: number | null;
  /** Maximum peak-to-trough drawdown (0 to -1 scale) */
  maxDrawdown: number | null;
  /** Alpha vs category benchmark */
  alpha: number | null;
  /** Expense ratio (annual, e.g. 0.01 = 1%) */
  expenseRatio: number | null;
  /** % of rolling 1-year periods with positive return */
  rollingReturnConsistency: number | null;
  /** % of down-market periods where fund outperformed benchmark */
  downsideProtection: number | null;
}

export interface QuantFundScoreBreakdown {
  /** Final composite score 0–100 */
  total: number;
  components: {
    rollingConsistency: { score: number; maxScore: 25; rawValue: number | null };
    sharpe: { score: number; maxScore: 20; rawValue: number | null };
    sortino: { score: number; maxScore: 15; rawValue: number | null };
    maxDrawdown: { score: number; maxScore: 15; rawValue: number | null };
    alpha: { score: number; maxScore: 10; rawValue: number | null };
    expenseRatio: { score: number; maxScore: 5; rawValue: number | null };
    downsideProtection: { score: number; maxScore: 10; rawValue: number | null };
  };
  /** Peer percentile within the category (0–100) */
  categoryPercentile: number | null;
  /** Number of funds in the peer group used for normalisation */
  peerCount: number;
  /** ISO timestamp of when this score was computed */
  computedAt: string;
}

// ─── Percentile normalisation helper ─────────────────────────────────────────

/**
 * Given a raw value and the sorted array of peer values (ascending),
 * returns a 0–100 percentile score.
 * Higher raw value = higher score (unless `lowerIsBetter` is true).
 */
function percentileScore(
  value: number,
  peerValues: number[],
  lowerIsBetter = false,
): number {
  if (peerValues.length === 0) return 50;
  const sorted = [...peerValues].sort((a, b) => a - b);
  let rank = sorted.filter((v) => v < value).length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * Computes the QuantFund Score for a single fund relative to its category peers.
 *
 * @param fund     - Metrics for the fund being scored
 * @param peers    - All funds in the same category (including `fund`)
 */
export function computeQuantFundScore(
  fund: FundMetrics,
  peers: FundMetrics[],
): QuantFundScoreBreakdown {
  const now = new Date().toISOString();

  // Extract peer arrays for each metric (null excluded)
  const peerConsistency = peers
    .map((p) => p.rollingReturnConsistency)
    .filter((v): v is number => v !== null);
  const peerSharpe = peers
    .map((p) => p.sharpe)
    .filter((v): v is number => v !== null);
  const peerSortino = peers
    .map((p) => p.sortino)
    .filter((v): v is number => v !== null);
  const peerDrawdown = peers
    .map((p) => p.maxDrawdown)
    .filter((v): v is number => v !== null);
  const peerAlpha = peers
    .map((p) => p.alpha)
    .filter((v): v is number => v !== null);
  const peerExpense = peers
    .map((p) => p.expenseRatio)
    .filter((v): v is number => v !== null);
  const peerProtection = peers
    .map((p) => p.downsideProtection)
    .filter((v): v is number => v !== null);

  // ── Per-component percentile (0–100) → scale to max points ────────────────

  const consistencyPct =
    fund.rollingReturnConsistency !== null && peerConsistency.length > 0
      ? percentileScore(fund.rollingReturnConsistency, peerConsistency)
      : 50;
  const sharpePct =
    fund.sharpe !== null && peerSharpe.length > 0
      ? percentileScore(fund.sharpe, peerSharpe)
      : 50;
  const sortinoPct =
    fund.sortino !== null && peerSortino.length > 0
      ? percentileScore(fund.sortino, peerSortino)
      : 50;
  const drawdownPct =
    fund.maxDrawdown !== null && peerDrawdown.length > 0
      ? // Lower drawdown (less negative) is better
        percentileScore(fund.maxDrawdown, peerDrawdown, true)
      : 50;
  const alphaPct =
    fund.alpha !== null && peerAlpha.length > 0
      ? percentileScore(fund.alpha, peerAlpha)
      : 50;
  const expensePct =
    fund.expenseRatio !== null && peerExpense.length > 0
      ? percentileScore(fund.expenseRatio, peerExpense, true) // lower = better
      : 50;
  const protectionPct =
    fund.downsideProtection !== null && peerProtection.length > 0
      ? percentileScore(fund.downsideProtection, peerProtection)
      : 50;

  // ── Scale to component max scores ─────────────────────────────────────────
  const c = {
    rollingConsistency: {
      score: Math.round((consistencyPct / 100) * 25),
      maxScore: 25 as const,
      rawValue: fund.rollingReturnConsistency,
    },
    sharpe: {
      score: Math.round((sharpePct / 100) * 20),
      maxScore: 20 as const,
      rawValue: fund.sharpe,
    },
    sortino: {
      score: Math.round((sortinoPct / 100) * 15),
      maxScore: 15 as const,
      rawValue: fund.sortino,
    },
    maxDrawdown: {
      score: Math.round((drawdownPct / 100) * 15),
      maxScore: 15 as const,
      rawValue: fund.maxDrawdown,
    },
    alpha: {
      score: Math.round((alphaPct / 100) * 10),
      maxScore: 10 as const,
      rawValue: fund.alpha,
    },
    expenseRatio: {
      score: Math.round((expensePct / 100) * 5),
      maxScore: 5 as const,
      rawValue: fund.expenseRatio,
    },
    downsideProtection: {
      score: Math.round((protectionPct / 100) * 10),
      maxScore: 10 as const,
      rawValue: fund.downsideProtection,
    },
  };

  const total =
    c.rollingConsistency.score +
    c.sharpe.score +
    c.sortino.score +
    c.maxDrawdown.score +
    c.alpha.score +
    c.expenseRatio.score +
    c.downsideProtection.score;

  // ── Overall category percentile ────────────────────────────────────────────
  // Computed separately by the ranking engine after all fund scores are known.

  return {
    total,
    components: c,
    categoryPercentile: null, // Filled in by ranking engine
    peerCount: peers.length,
    computedAt: now,
  };
}

// ─── Metric calculators ───────────────────────────────────────────────────────
// These live here so the risk-free rate import is co-located and consistent.

/** Annualised CAGR from start NAV to end NAV over `years` years. */
export function cagr(startNav: number, endNav: number, years: number): number {
  if (years <= 0 || startNav <= 0) throw new Error("Invalid CAGR inputs");
  return Math.pow(endNav / startNav, 1 / years) - 1;
}

/**
 * Sharpe ratio.
 * Uses RISK_FREE_RATE_ANNUAL from the centralised source.
 */
export function sharpeRatio(
  annualisedReturn: number,
  annualisedStdDev: number,
): number {
  if (annualisedStdDev === 0) return 0;
  return (annualisedReturn - RISK_FREE_RATE_ANNUAL) / annualisedStdDev;
}

/**
 * Sortino ratio.
 * Uses RISK_FREE_RATE_ANNUAL from the centralised source.
 * Downside deviation computed against a target return of 0 (MAR = 0).
 */
export function sortinoRatio(
  annualisedReturn: number,
  annualisedDownsideDev: number,
): number {
  if (annualisedDownsideDev === 0) return 0;
  return (annualisedReturn - RISK_FREE_RATE_ANNUAL) / annualisedDownsideDev;
}

/**
 * Maximum drawdown from a NAV series (array of prices, chronological).
 * Returns a value in [-1, 0].  -0.3 means 30% peak-to-trough loss.
 */
export function maxDrawdown(navSeries: number[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    const dd = (nav - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Annualised standard deviation of daily returns.
 * `returns` should be an array of daily simple returns, e.g. [0.01, -0.005, ...].
 */
export function annualisedStdDev(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    (dailyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Annualised downside deviation (semi-deviation below MAR = 0).
 */
export function annualisedDownsideDev(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const negReturns = dailyReturns.filter((r) => r < 0);
  if (negReturns.length === 0) return 0;
  const variance =
    negReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) /
    dailyReturns.length; // Use total N, not just negative N (Sortino convention)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
