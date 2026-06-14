/**
 * fund-metrics.ts — pure functions over a NAV series.
 *
 * Every number this file returns is computed from real NAV history. Anything
 * we can't honestly compute (AUM, expense ratio, fund-manager tenure) lives
 * elsewhere and we don't fake it.
 */

import type { NavPoint } from "./nav-history";
import {
  RISK_FREE_RATE_ANNUAL,
  TRADING_DAYS_PER_YEAR,
} from "./risk-free-rate";

const MS_PER_DAY = 86_400_000;

/** Find NAV at-or-before a target timestamp (binary search). */
function navAtOrBefore(series: NavPoint[], t: number): NavPoint | null {
  if (series.length === 0 || t < series[0].t) return null;
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans] : null;
}

/** Trailing return over `years` (CAGR if >1y, simple return otherwise). null if insufficient history. */
export function trailingReturn(series: NavPoint[], years: number): number | null {
  if (series.length < 2) return null;
  const end = series[series.length - 1];
  const targetT = end.t - years * 365 * MS_PER_DAY;
  const start = navAtOrBefore(series, targetT);
  if (!start || start.t === end.t) return null;
  const actualYears = (end.t - start.t) / (365 * MS_PER_DAY);
  if (actualYears < years * 0.85) return null; // need ~85% of requested window
  const total = end.nav / start.nav;
  if (years >= 1) return Math.pow(total, 1 / actualYears) - 1;
  return total - 1;
}

/** Daily log returns (using only weekday rows that mfapi.in actually returns). */
function dailyLogReturns(series: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const r = Math.log(series[i].nav / series[i - 1].nav);
    if (isFinite(r)) out.push(r);
  }
  return out;
}

/** Annualised stdev of daily returns × √252. */
export function annualVol(series: NavPoint[], lookbackDays = TRADING_DAYS_PER_YEAR * 3): number | null {
  const slice = series.slice(-lookbackDays - 1);
  if (slice.length < 60) return null;
  const rets = dailyLogReturns(slice);
  if (rets.length < 30) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Annualised downside deviation (returns below 0). */
export function downsideVol(series: NavPoint[], lookbackDays = TRADING_DAYS_PER_YEAR * 3): number | null {
  const slice = series.slice(-lookbackDays - 1);
  if (slice.length < 60) return null;
  const rets = dailyLogReturns(slice);
  if (rets.length < 30) return null;
  const neg = rets.filter((r) => r < 0);
  if (neg.length === 0) return 0;
  const v = neg.reduce((s, r) => s + r * r, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function sharpe(series: NavPoint[]): number | null {
  const r3y = trailingReturn(series, 3) ?? trailingReturn(series, 1);
  const vol = annualVol(series);
  if (r3y == null || vol == null || vol === 0) return null;
  return (r3y - RISK_FREE_RATE_ANNUAL) / vol;
}

export function sortino(series: NavPoint[]): number | null {
  const r3y = trailingReturn(series, 3) ?? trailingReturn(series, 1);
  const dd = downsideVol(series);
  if (r3y == null || dd == null || dd === 0) return null;
  return (r3y - RISK_FREE_RATE_ANNUAL) / dd;
}

/** Max peak-to-trough drawdown over the full series. Value in [-1, 0]. */
export function maxDrawdown(series: NavPoint[]): number | null {
  if (series.length < 30) return null;
  let peak = -Infinity, worst = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    const dd = (p.nav - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/** % of rolling 1y windows with positive return. */
export function rollingPositiveRate(series: NavPoint[], windowDays = 252): number | null {
  if (series.length < windowDays + 30) return null;
  let pos = 0, total = 0;
  for (let i = windowDays; i < series.length; i++) {
    const r = series[i].nav / series[i - windowDays].nav - 1;
    total++;
    if (r > 0) pos++;
  }
  return total > 0 ? pos / total : null;
}

export interface FundMetrics {
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
  cagr10y: number | null;
  vol: number | null;
  downsideVol: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  rollingPositive1y: number | null;
  navStart: NavPoint | null;
  navEnd: NavPoint | null;
  history_years: number;
}

export function computeFundMetrics(series: NavPoint[]): FundMetrics {
  const years = series.length > 1 ? (series[series.length - 1].t - series[0].t) / (365 * MS_PER_DAY) : 0;
  return {
    ret1m: trailingReturn(series, 1 / 12),
    ret3m: trailingReturn(series, 0.25),
    ret6m: trailingReturn(series, 0.5),
    ret1y: trailingReturn(series, 1),
    cagr3y: trailingReturn(series, 3),
    cagr5y: trailingReturn(series, 5),
    cagr10y: trailingReturn(series, 10),
    vol: annualVol(series),
    downsideVol: downsideVol(series),
    sharpe: sharpe(series),
    sortino: sortino(series),
    maxDrawdown: maxDrawdown(series),
    rollingPositive1y: rollingPositiveRate(series),
    navStart: series[0] ?? null,
    navEnd: series[series.length - 1] ?? null,
    history_years: years,
  };
}

/**
 * Transparent composite score 0–100 from real metrics.
 * Weights: CAGR3Y 35 · Sharpe 25 · Drawdown 20 · Consistency 20.
 * Returns null if we don't have enough history (no fabrication).
 */
export function quantFundScore(m: FundMetrics): number | null {
  const parts: number[] = [];
  let totalW = 0;

  if (m.cagr3y != null) {
    // Map -10%..+30% → 0..100
    parts.push(35 * clamp01((m.cagr3y + 0.1) / 0.4));
    totalW += 35;
  }
  if (m.sharpe != null) {
    // -0.5..2.5 → 0..100
    parts.push(25 * clamp01((m.sharpe + 0.5) / 3));
    totalW += 25;
  }
  if (m.maxDrawdown != null) {
    // 0..-60% → 100..0 (less drawdown = better)
    parts.push(20 * clamp01(1 + m.maxDrawdown / 0.6));
    totalW += 20;
  }
  if (m.rollingPositive1y != null) {
    parts.push(20 * clamp01(m.rollingPositive1y));
    totalW += 20;
  }
  if (totalW < 35) return null; // need at least the CAGR pillar
  const sum = parts.reduce((a, b) => a + b, 0);
  return (sum / totalW) * 100;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Calmar ratio = 3Y CAGR / |Max Drawdown|.
 * Measures how much compounded return is earned per unit of worst-case loss.
 * Higher = better. Typical range: 0.2 – 3.0.
 */
export function calmarRatio(m: FundMetrics): number | null {
  if (m.cagr3y == null || m.maxDrawdown == null) return null;
  if (m.maxDrawdown === 0) return m.cagr3y >= 0 ? 10 : null;
  if (m.maxDrawdown >= 0) return null;
  return m.cagr3y / Math.abs(m.maxDrawdown);
}

/**
 * Percentile of value `v` within `arr` (0–100).
 * `lowerIsBetter` reverses the direction (e.g. maxDrawdown).
 */
export function percentileOf(arr: number[], v: number, lowerIsBetter = false): number {
  if (arr.length <= 1) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter((x) => x < v).length;
  const equal = sorted.filter((x) => x === v).length;
  const pct = ((below + equal * 0.5) / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}

export interface PoolFundData {
  metrics: FundMetrics;
  calmar: number | null;
}

/**
 * Advanced cross-category score (0–100) using percentile normalization.
 * Each of the 6 factors is percentile-ranked within the full pool before weighting,
 * so the score is relative (not absolute) and valid for cross-category comparison.
 *
 * Weights:
 *   Sharpe Ratio      28% — risk-adjusted return per unit volatility
 *   Sortino Ratio     22% — return per unit of downside volatility
 *   Calmar Ratio      20% — 3Y CAGR / |MaxDD| (return per unit worst-case loss)
 *   3Y CAGR           15% — absolute compounded return
 *   Rolling 1Y Pos%   10% — consistency across rolling 1Y windows
 *   Max Drawdown       5% — magnitude of worst peak-to-trough loss (lower = better)
 */
export function advancedPoolScore(fund: PoolFundData, pool: PoolFundData[]): number | null {
  const get = <K extends keyof PoolFundData>(
    key: K,
    sub?: keyof FundMetrics,
  ): number[] => {
    if (key === "calmar") return pool.map((f) => f.calmar).filter((v): v is number => v != null);
    return pool.map((f) => (f.metrics as any)[sub!]).filter((v): v is number => v != null);
  };

  const criteria: { values: number[]; v: number | null; w: number; lowerBetter?: boolean }[] = [
    { values: get("metrics", "sharpe"),            v: fund.metrics.sharpe,            w: 28 },
    { values: get("metrics", "sortino"),           v: fund.metrics.sortino,           w: 22 },
    { values: get("calmar"),                       v: fund.calmar,                    w: 20 },
    { values: get("metrics", "cagr3y"),            v: fund.metrics.cagr3y,            w: 15 },
    { values: get("metrics", "rollingPositive1y"), v: fund.metrics.rollingPositive1y, w: 10 },
    { values: get("metrics", "maxDrawdown"),       v: fund.metrics.maxDrawdown,       w:  5, lowerBetter: true },
  ];

  let totalW = 0;
  let score = 0;

  for (const { values, v, w, lowerBetter } of criteria) {
    if (v == null || values.length <= 1) continue;
    const pct = percentileOf(values, v, lowerBetter);
    score += pct * w;
    totalW += w;
  }

  if (totalW < 28) return null; // Sharpe pillar is mandatory
  return score / totalW;
}
