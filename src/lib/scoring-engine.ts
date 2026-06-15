/**
 * scoring-engine.ts — Production Mutual Fund Scoring Engine v5 (Phase 2)
 *
 * Phase 2 additions:
 *   • Tracking Error (TE)   — StdDev of daily excess returns, annualised
 *   • Jensen's Alpha        — Beta-adjusted outperformance vs benchmark
 *   • Omega Ratio           — Probability-weighted return quality above RFR
 *   • Bear Market Return    — Fund's annualised return during benchmark down-months
 *
 * These are all computable from NAV + the equal-weighted category benchmark.
 * Phase 3 (needs additional data feeds): expense ratio, P/E, P/B, holdings,
 * sector HHI, active share, manager tenure, AUM, 3-month smoothing.
 *
 *   Pillar                       Weight  Phase 2 Metrics
 *   ────────────────────────────────────────────────────────────────────────────
 *   1. Long-Term Consistency         23%  3Y/5Y/7Y/10Y CAGR + Consistency Bonus
 *   2. Short-Term Performance         5%  1D/1M/3M/6M returns
 *   3. Risk-Adjusted                 20%  Sortino(10) + Sharpe(6) + IR(4)
 *   4. Downside Protection           20%  ↓Cap(8)+↑Cap(3)+MaxDD(4)+Recovery(3)+Beta(1)+StdDev(1)
 *   5. Cost Efficiency               15%  Jensen's Alpha(9) + Tracking Error(6, lower)
 *   6. Portfolio Quality             12%  Calmar(4) + Omega(5) + Rolling StdDev(3, lower)
 *   7. Management & AUM               5%  Longevity(1) + Rolling 1Y+(2) + Bear Mkt Return(2)
 *
 * Final Published Score = round(fundScore × 0.90 + confidenceScore × 0.10)
 */

import type { NavPoint } from "./nav-history";
import { RISK_FREE_RATE_ANNUAL, TRADING_DAYS_PER_YEAR } from "./risk-free-rate";

const MS_PER_DAY = 86_400_000;
const YEAR_MS = 365 * MS_PER_DAY;

// ─── Low-level helpers ────────────────────────────────────────────────────────

function navAtOrBefore(series: NavPoint[], t: number): NavPoint | null {
  if (!series.length || t < series[0].t) return null;
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans] : null;
}

function trailingCAGR(series: NavPoint[], years: number): number | null {
  if (series.length < 2) return null;
  const end = series[series.length - 1];
  const start = navAtOrBefore(series, end.t - years * YEAR_MS);
  if (!start || start.t === end.t) return null;
  const actual = (end.t - start.t) / YEAR_MS;
  if (actual < years * 0.85) return null;
  return years >= 1 ? Math.pow(end.nav / start.nav, 1 / actual) - 1 : end.nav / start.nav - 1;
}

function logReturns(series: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const r = Math.log(series[i].nav / series[i - 1].nav);
    if (isFinite(r)) out.push(r);
  }
  return out;
}

function annVol(lRets: number[]): number | null {
  if (lRets.length < 30) return null;
  const m = lRets.reduce((a, b) => a + b, 0) / lRets.length;
  const v = lRets.reduce((s, r) => s + (r - m) ** 2, 0) / (lRets.length - 1);
  return Math.sqrt(v * TRADING_DAYS_PER_YEAR);
}

function annDownsideVol(lRets: number[]): number | null {
  if (lRets.length < 30) return null;
  const neg = lRets.filter(r => r < 0);
  if (!neg.length) return 0.001;
  const v = neg.reduce((s, r) => s + r * r, 0) / lRets.length;
  return Math.sqrt(v * TRADING_DAYS_PER_YEAR);
}

function maxDrawdown(series: NavPoint[]): number | null {
  if (series.length < 10) return null;
  let peak = -Infinity, worst = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    const dd = (p.nav - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

function recoveryMonths(series: NavPoint[]): number | null {
  if (series.length < 30) return null;
  let peak = -Infinity, peakIdx = 0;
  let maxDD = 0, ddPeakIdx = 0;
  for (let i = 0; i < series.length; i++) {
    if (series[i].nav > peak) { peak = series[i].nav; peakIdx = i; }
    const dd = (series[i].nav - peak) / peak;
    if (dd < maxDD) { maxDD = dd; ddPeakIdx = peakIdx; }
  }
  if (maxDD > -0.03) return 0;
  const peakNav = series[ddPeakIdx].nav;
  for (let i = ddPeakIdx + 1; i < series.length; i++) {
    if (series[i].nav >= peakNav) {
      return (series[i].t - series[ddPeakIdx].t) / (30 * MS_PER_DAY);
    }
  }
  return (series[series.length - 1].t - series[ddPeakIdx].t) / (30 * MS_PER_DAY);
}

function rollingPositiveRate(series: NavPoint[], years: number): number | null {
  const windowMs = years * YEAR_MS;
  const minMs = windowMs * 0.85;
  let pos = 0, total = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const start = navAtOrBefore(series, series[i].t - windowMs);
    if (!start) break;
    if (series[i].t - start.t < minMs) continue;
    total++;
    if (series[i].nav > start.nav) pos++;
  }
  return total >= 8 ? pos / total : null;
}

/**
 * Consistency Bonus — % of rolling `years`-year windows where this fund beats
 * the category equal-weighted benchmark. Falls back to rolling-positive-rate
 * when no benchmark is available.
 */
function rollingAlphaRate(
  series: NavPoint[],
  benchmark: NavPoint[],
  years: number,
): number | null {
  const windowMs = years * YEAR_MS;
  const minMs = windowMs * 0.85;
  const bmMap = new Map(benchmark.map(p => [p.d, p.nav]));
  let beat = 0, total = 0;

  for (let i = series.length - 1; i >= 0; i--) {
    const startSeries = navAtOrBefore(series, series[i].t - windowMs);
    if (!startSeries) break;
    if (series[i].t - startSeries.t < minMs) continue;

    const bmEnd   = bmMap.get(series[i].d);
    const bmStart = bmMap.get(startSeries.d);
    if (!bmEnd || !bmStart || bmStart === 0) continue;

    const fundRet = series[i].nav / startSeries.nav - 1;
    const bmRet   = bmEnd / bmStart - 1;

    total++;
    if (fundRet > bmRet) beat++;
  }

  return total >= 8 ? beat / total : null;
}

/** Std dev of rolling `years`-year returns — lower = more consistent NAV growth */
function rollingReturnStdDev(series: NavPoint[], years: number): number | null {
  const windowMs = years * YEAR_MS;
  const minMs = windowMs * 0.85;
  const returns: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = navAtOrBefore(series, series[i].t - windowMs);
    if (!start) continue;
    if (series[i].t - start.t < minMs) continue;
    const r = series[i].nav / start.nav - 1;
    if (isFinite(r)) returns.push(r);
  }
  if (returns.length < 12) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const v = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(v);
}
/**
 * Rolling Return Average — arithmetic mean of all rolling `years`-year point-to-point returns.
 * Answers: "If someone invested for exactly N years on any random day, what was their average return?"
 * Returns a fraction (e.g. 0.12 = 12%). Requires ≥ 8 valid windows.
 */
function rollingReturnAvg(series: NavPoint[], years: number): number | null {
  const windowMs = years * YEAR_MS;
  const minMs = windowMs * 0.85;
  const returns: number[] = [];
  for (let i = series.length - 1; i >= 0; i--) {
    const start = navAtOrBefore(series, series[i].t - windowMs);
    if (!start) break;
    if (series[i].t - start.t < minMs) continue;
    const r = series[i].nav / start.nav - 1;
    if (isFinite(r)) returns.push(r);
  }
  return returns.length >= 8 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
}

/**
 * Rolling Returns Array — every rolling `years`-year point-to-point return as a
 * fraction (e.g. 0.12 = 12%). Used for median / distribution-based metrics.
 * Requires ≥ 8 valid windows, otherwise returns an empty array.
 */
function rollingReturnsArray(series: NavPoint[], years: number): number[] {
  const windowMs = years * YEAR_MS;
  const minMs = windowMs * 0.85;
  const returns: number[] = [];
  for (let i = series.length - 1; i >= 0; i--) {
    const start = navAtOrBefore(series, series[i].t - windowMs);
    if (!start) break;
    if (series[i].t - start.t < minMs) continue;
    const r = series[i].nav / start.nav - 1;
    if (isFinite(r)) returns.push(r);
  }
  return returns.length >= 8 ? returns : [];
}

/** Median of a numeric array. Returns null for an empty array. */
function medianOf(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Omega Ratio — probability-weighted return quality above the daily risk-free rate.
 * omega = Σ max(0, r − MAR) / Σ max(0, MAR − r)
 * where MAR = daily risk-free rate.
 * Higher omega = more return per unit of shortfall risk.
 */
function omegaRatio(lRets: number[]): number | null {
  if (lRets.length < 60) return null;
  const dailyRFR = RISK_FREE_RATE_ANNUAL / TRADING_DAYS_PER_YEAR;
  let gains = 0, losses = 0;
  for (const r of lRets) {
    if (r > dailyRFR) gains  += r - dailyRFR;
    else              losses += dailyRFR - r;
  }
  return losses > 0 ? gains / losses : null;
}

function percentileOf(arr: number[], v: number, lowerIsBetter = false): number {
  if (arr.length <= 1) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter(x => x < v).length;
  const equal = sorted.filter(x => x === v).length;
  const p = ((below + equal * 0.5) / sorted.length) * 100;
  return lowerIsBetter ? 100 - p : p;
}

// ─── Category benchmark ───────────────────────────────────────────────────────

export function buildBenchmark(peerSeries: NavPoint[][]): NavPoint[] | null {
  if (peerSeries.length < 5) return null;
  const dateMap = new Map<string, number[]>();
  for (const series of peerSeries) {
    if (!series.length) continue;
    const base = series[0].nav;
    for (const pt of series) {
      const norm = (pt.nav / base) * 100;
      let arr = dateMap.get(pt.d);
      if (!arr) { arr = []; dateMap.set(pt.d, arr); }
      arr.push(norm);
    }
  }
  const minCoverage = Math.min(3, Math.ceil(peerSeries.length * 0.3));
  const result: NavPoint[] = [];
  for (const [d, navs] of dateMap) {
    if (navs.length < minCoverage) continue;
    const avg = navs.reduce((a, b) => a + b, 0) / navs.length;
    const t = new Date(d + "T00:00:00Z").getTime();
    if (isFinite(t)) result.push({ t, d, nav: avg });
  }
  result.sort((a, b) => a.t - b.t);
  return result.length >= 100 ? result : null;
}

// ─── Benchmark-relative metrics ───────────────────────────────────────────────

interface BenchmarkMetrics {
  beta: number | null;
  downsideCapture: number | null;
  upsideCapture: number | null;
  informationRatio: number | null;
  trackingError: number | null;
  longRunAlpha: number | null;
  jensensAlpha: number | null;
  consistencyBeatRate: number | null;
  bearMarketReturn: number | null;
}

export function computeBenchmarkMetrics(
  series: NavPoint[],
  benchmark: NavPoint[],
): BenchmarkMetrics {
  const benchCAGR3Y = trailingCAGR(benchmark, 3);
  const fundCAGR3Y  = trailingCAGR(series, 3);
  const longRunAlpha =
    fundCAGR3Y != null && benchCAGR3Y != null ? fundCAGR3Y - benchCAGR3Y : null;

  const consistencyBeatRate = rollingAlphaRate(series, benchmark, 3);

  const benchMap = new Map(benchmark.map(p => [p.d, p.nav]));

  const pairs: { f: number; b: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const bCurr = benchMap.get(series[i].d);
    const bPrev = benchMap.get(series[i - 1].d);
    if (bCurr == null || bPrev == null) continue;
    const f = Math.log(series[i].nav / series[i - 1].nav);
    const b = Math.log(bCurr / bPrev);
    if (isFinite(f) && isFinite(b)) pairs.push({ f, b });
  }

  if (pairs.length < 60) {
    return { beta: null, downsideCapture: null, upsideCapture: null,
             informationRatio: null, trackingError: null, longRunAlpha,
             jensensAlpha: null, consistencyBeatRate, bearMarketReturn: null };
  }

  const fM = pairs.reduce((s, p) => s + p.f, 0) / pairs.length;
  const bM = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
  let cov = 0, varB = 0;
  for (const { f, b } of pairs) { cov += (f - fM) * (b - bM); varB += (b - bM) ** 2; }
  const beta = varB > 0 ? cov / varB : null;

  const excess = pairs.map(p => p.f - p.b);
  const exM = excess.reduce((a, e) => a + e, 0) / excess.length;
  const exV = excess.reduce((s, e) => s + (e - exM) ** 2, 0) / (excess.length - 1);
  const te  = Math.sqrt(exV * TRADING_DAYS_PER_YEAR);
  const trackingError    = te > 0 ? te : null;
  const informationRatio = te > 0 ? (exM * TRADING_DAYS_PER_YEAR) / te : null;

  const jensensAlpha =
    fundCAGR3Y != null && benchCAGR3Y != null && beta != null
      ? fundCAGR3Y - (RISK_FREE_RATE_ANNUAL + beta * (benchCAGR3Y - RISK_FREE_RATE_ANNUAL))
      : null;

  const monthly = new Map<string, { f: number; b: number }>();
  for (let i = 1; i < series.length; i++) {
    const bCurr = benchMap.get(series[i].d);
    const bPrev = benchMap.get(series[i - 1].d);
    if (bCurr == null || bPrev == null) continue;
    const ym = series[i].d.slice(0, 7);
    const f  = Math.log(series[i].nav / series[i - 1].nav);
    const b  = Math.log(bCurr / bPrev);
    if (!isFinite(f) || !isFinite(b)) continue;
    const cur = monthly.get(ym) ?? { f: 0, b: 0 };
    monthly.set(ym, { f: cur.f + f, b: cur.b + b });
  }

  let dFS = 0, dBS = 0, dN = 0, uFS = 0, uBS = 0, uN = 0;
  for (const { f, b } of monthly.values()) {
    if (b < 0) { dFS += f; dBS += b; dN++; }
    else if (b > 0) { uFS += f; uBS += b; uN++; }
  }
  const downsideCapture = dN >= 6 && dBS !== 0 ? (dFS / dBS) * 100 : null;
  const upsideCapture   = uN >= 6 && uBS !== 0 ? (uFS / uBS) * 100 : null;

  const bearMarketReturn = dN >= 6 ? (dFS / dN) * 12 : null;

  return { beta, downsideCapture, upsideCapture, informationRatio,
           trackingError, longRunAlpha, jensensAlpha, consistencyBeatRate, bearMarketReturn };
}

// ─── Public metric type ───────────────────────────────────────────────────────

export interface EngineMetrics {
  // Pillar 1 — Long-Term Consistency
  cagr3y:              number | null;
  cagr5y:              number | null;
  cagr7y:              number | null;
  cagr10y:             number | null;
  consistencyBeatRate: number | null;

  // Pillar 2 — Short-Term Performance
  ret1d: number | null;
  ret1w: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;

  /** Average of all available 1-year rolling returns (simple, not CAGR). */
  annualReturnAvg: number | null;

  // Pillar 3 — Risk-Adjusted (Sortino 10, Sharpe 6, IR 4)
  sharpe:           number | null;
  sortino:          number | null;
  informationRatio: number | null;

  // Pillar 4 — Downside Protection (↓Cap 8, ↑Cap 3, MaxDD 4, Recovery 3, Beta 1, StdDev 1)
  maxDrawdown:     number | null;
  recoveryMonths:  number | null;
  stdDev:          number | null;
  beta:            number | null;
  downsideCapture: number | null;
  upsideCapture:   number | null;

  // Pillar 5 — Cost Efficiency (Phase 2: Jensen's Alpha 9 + Tracking Error 6)
  jensensAlpha:  number | null;
  trackingError: number | null;
  longRunAlpha:  number | null;

  // Pillar 6 — Portfolio Quality (Phase 2: Calmar 4 + Omega 5 + Rolling StdDev 3)
  calmarRatio:  number | null;
  omegaRatio:   number | null;
  rollingStdDev: number | null;

  // Pillar 7 — Management & AUM (Phase 2: Longevity 1 + Rolling 1Y+ 2 + Bear Mkt Return 2)
  rollingPos1y:       number | null;
  /** Arithmetic mean of all rolling 1Y point-to-point returns. */
  rollingReturn1yAvg: number | null;
  /** Arithmetic mean of all rolling 3Y point-to-point returns. */
  rollingReturn3yAvg: number | null;
  /** Arithmetic mean of all rolling 5Y point-to-point returns. */
  rollingReturn5yAvg: number | null;
  /** Arithmetic mean of all rolling 7Y point-to-point returns. */
  rollingReturn7yAvg: number | null;
  /** Median of all rolling 3Y point-to-point returns — used by the Performance category. */
  medianRollingReturn3y: number | null;
  /** Calendar-year simple returns as fractions, chronological. */
  calendarYearReturns: number[];
  bearMarketReturn: number | null;

  historyYears: number;
  dataPoints:   number;
}

// ─── Annual Return Average helper ────────────────────────────────────────────

export function computeCalendarYearReturns(series: NavPoint[]): number[] {
  if (series.length < 2) return [];
  const firstYear = new Date(series[0].t).getUTCFullYear();
  const lastYear  = new Date(series[series.length - 1].t).getUTCFullYear();
  if (lastYear <= firstYear) return [];

  const yearReturns: number[] = [];
  for (let yr = firstYear; yr < lastYear; yr++) {
    const yearEndMs = Date.UTC(yr, 11, 31, 23, 59, 59, 999);
    let startPoint: NavPoint | null = null;
    for (const p of series) {
      if (new Date(p.t).getUTCFullYear() === yr) { startPoint = p; break; }
    }
    if (!startPoint) continue;
    const endPoint = navAtOrBefore(series, yearEndMs);
    if (!endPoint) continue;
    if (new Date(endPoint.t).getUTCFullYear() !== yr) continue;
    if (startPoint === endPoint) continue;
    const ret = endPoint.nav / startPoint.nav - 1;
    if (isFinite(ret)) yearReturns.push(ret);
  }
  return yearReturns;
}

function computeAnnualReturnAvg(series: NavPoint[]): number | null {
  const yrs = computeCalendarYearReturns(series);
  if (yrs.length === 0) return null;
  return yrs.reduce((a, b) => a + b, 0) / yrs.length;
}

// ─── Compute metrics for one fund ────────────────────────────────────────────

export function computeEngineMetrics(
  series: NavPoint[],
  benchmark?: NavPoint[] | null,
): EngineMetrics {
  const historyYears = series.length > 1
    ? (series[series.length - 1].t - series[0].t) / YEAR_MS : 0;

  const lRets = logReturns(series);
  const vol   = annVol(lRets);
  const ddVol = annDownsideVol(lRets);
  const r3y   = trailingCAGR(series, 3) ?? trailingCAGR(series, 1);

  const sharpe  = r3y != null && vol   != null && vol   > 0 ? (r3y - RISK_FREE_RATE_ANNUAL) / vol   : null;
  const sortino = r3y != null && ddVol != null && ddVol > 0 ? (r3y - RISK_FREE_RATE_ANNUAL) / ddVol : null;

  const mxDD    = maxDrawdown(series);
  const cagr3y  = trailingCAGR(series, 3);
  const calmar  = cagr3y != null && mxDD != null && mxDD < 0
    ? cagr3y / Math.abs(mxDD) : null;

  const bm = benchmark
    ? computeBenchmarkMetrics(series, benchmark)
    : {
        beta: null, downsideCapture: null, upsideCapture: null,
        informationRatio: null, trackingError: null, longRunAlpha: null,
        jensensAlpha: null, consistencyBeatRate: null, bearMarketReturn: null,
      };

  const consistencyBeatRate = bm.consistencyBeatRate ?? rollingPositiveRate(series, 3);

  return {
    cagr3y,
    cagr5y:  trailingCAGR(series, 5),
    cagr7y:  trailingCAGR(series, 7),
    cagr10y: trailingCAGR(series, 10),
    consistencyBeatRate,

    ret1d: trailingCAGR(series, 1 / 365),
    ret1w: trailingCAGR(series, 1 / 52),
    ret1m: trailingCAGR(series, 1 / 12),
    ret3m: trailingCAGR(series, 3 / 12),
    ret6m: trailingCAGR(series, 6 / 12),
    ret1y: trailingCAGR(series, 1),
    annualReturnAvg: computeAnnualReturnAvg(series),

    sharpe,
    sortino,
    informationRatio: bm.informationRatio,

    maxDrawdown:     mxDD,
    recoveryMonths:  recoveryMonths(series),
    stdDev:          vol,
    beta:            bm.beta,
    downsideCapture: bm.downsideCapture,
    upsideCapture:   bm.upsideCapture,

    jensensAlpha:  bm.jensensAlpha,
    trackingError: bm.trackingError,
    longRunAlpha:  bm.longRunAlpha,

    calmarRatio:  calmar,
    omegaRatio:   omegaRatio(lRets),
    rollingStdDev: rollingReturnStdDev(series, 1),

    rollingPos1y:       rollingPositiveRate(series, 1),
    rollingReturn1yAvg: rollingReturnAvg(series, 1),
    rollingReturn3yAvg: rollingReturnAvg(series, 3),
    rollingReturn5yAvg: rollingReturnAvg(series, 5),
    rollingReturn7yAvg: rollingReturnAvg(series, 7),
    medianRollingReturn3y: medianOf(rollingReturnsArray(series, 3)),
    calendarYearReturns: computeCalendarYearReturns(series),
    bearMarketReturn: bm.bearMarketReturn,

    historyYears,
    dataPoints: series.length,
  };
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Eligibility gate per the QuantFund v6 methodology:
 *   - Minimum 5 years of NAV history
 *   - Direct plan only
 *   - Sufficient NAV history to compute 3Y rolling returns (≥ 8 rolling windows)
 *
 * Funds that fail eligibility are not given a Fund Score / Confidence Score —
 * the UI should display "Not Ranked — see eligibility" instead.
 */
export function checkEligibility(params: {
  historyYears: number;
  isDirectPlan: boolean;
  rolling3yWindowCount: number;
}): EligibilityResult {
  const reasons: string[] = [];
  if (params.historyYears < 5) reasons.push("Less than 5 years of NAV history");
  if (!params.isDirectPlan) reasons.push("Not a Direct plan");
  if (params.rolling3yWindowCount < 8) reasons.push("Insufficient NAV history for 3Y rolling-return calculations");
  return { eligible: reasons.length === 0, reasons };
}

// ─── Confidence Score (0-100, separate from Fund Score) ──────────────────────
//
// Factors:
//   Fund Age            40%  — longer history = more reliable statistics
//   Data Completeness   30%  — % of required metrics that could be computed
//   Manager Stability   15%  — manager tenure/change data (unavailable → neutral 50)
//   AUM Stability       15%  — AUM history data (unavailable → neutral 50)
//
// Manager Stability and AUM Stability are not derivable from AMFI/mfapi.in NAV
// history alone. Rather than fabricate values, both factors default to a
// neutral 50/100 score, which is disclosed in the methodology page.

export function computeConfidenceScore(m: EngineMetrics): number {
  // Fund Age — 40%
  const ageScore =
    m.historyYears >= 10 ? 100 :
    m.historyYears >=  7 ?  85 :
    m.historyYears >=  5 ?  70 :
    m.historyYears >=  3 ?  50 : 30;

  // Data Completeness — 30%
  const keys: (keyof EngineMetrics)[] = [
    "sharpe", "sortino", "maxDrawdown", "downsideCapture",
    "rollingReturn3yAvg", "rollingReturn5yAvg", "medianRollingReturn3y",
    "consistencyBeatRate", "informationRatio", "longRunAlpha",
  ];
  const avail = keys.filter(k => m[k] != null).length;
  const completenessScore = Math.round((avail / keys.length) * 100);

  // Manager Stability — 15% (data not available; neutral)
  const managerStabilityScore = 50;

  // AUM Stability — 15% (data not available; neutral)
  const aumStabilityScore = 50;

  return Math.round(
    ageScore              * 0.40 +
    completenessScore     * 0.30 +
    managerStabilityScore * 0.15 +
    aumStabilityScore     * 0.15
  );
}

// ─── Rating bands ─────────────────────────────────────────────────────────────

export function getRating(score: number): { rating: string; color: string; bg: string } {
  if (score >= 95) return { rating: "Elite+",       color: "text-cyan",     bg: "bg-cyan/10 border-cyan/30" };
  if (score >= 90) return { rating: "Elite",        color: "text-cyan",     bg: "bg-cyan/10 border-cyan/30" };
  if (score >= 80) return { rating: "Excellent",    color: "text-positive", bg: "bg-positive/10 border-positive/30" };
  if (score >= 70) return { rating: "Good",         color: "text-positive", bg: "bg-positive/10 border-positive/30" };
  if (score >= 60) return { rating: "Average",      color: "text-warning",  bg: "bg-warning/10 border-warning/30" };
  if (score >= 50) return { rating: "Below Average", color: "text-warning",  bg: "bg-warning/10 border-warning/30" };
  return            { rating: "Weak",          color: "text-negative", bg: "bg-negative/10 border-negative/30" };
}

// ─── Score one fund with peer context ─────────────────────────────────────────

export interface PillarResult {
  rawScore: number;
  weight:   number;
  label:    string;
  available: boolean;
}

export interface EngineScoreResult {
  fundScore:       number;
  confidenceScore: number;
  finalScore:      number;
  rating:          string;
  ratingColor:     string;
  pillars: {
    risk:           PillarResult;
    performance:    PillarResult;
    consistency:    PillarResult;
    benchmarkSkill: PillarResult;
    portfolioQuality: PillarResult;
    managerQuality:   PillarResult;
  };
}

/**
 * QuantFund v6 category-based scoring methodology.
 *
 * Every metric is converted into a percentile rank (0-100) within the same
 * category's peer set before being weighted. Category scores are then
 * combined into the Fund Score using the weights below.
 *
 *   Category            Weight   Metrics (internal weighting)
 *   ──────────────────────────────────────────────────────────────────────
 *   Risk                 30%     Sharpe(8) + Sortino(8) + MaxDD(8) + DownsideCapture(6)
 *   Performance          25%     3Y Mean Rolling(8) + 5Y Mean Rolling(12) + Median Rolling(5)
 *   Consistency          20%     Benchmark Outperformance(8) + Peer Outperformance(7) + Quartile Consistency(5)
 *   Benchmark Skill      10%     Information Ratio(6) + Alpha(4)
 *   Portfolio Quality    10%     Not available from AMFI/mfapi.in — marked unavailable
 *   Manager Quality       5%     Not available from AMFI/mfapi.in — marked unavailable
 *
 * Portfolio Quality and Manager Quality (combined 15%) are not computable from
 * NAV history alone. Per the "never fake data" requirement, both are marked
 * `available: false` and excluded from the Fund Score; their combined weight
 * is redistributed proportionally across the four available categories.
 *
 * Fund Score = round(Σ categoryScore × redistributedWeight), range 0-100.
 * Confidence Score is computed separately and NEVER combined into Fund Score.
 * finalScore === fundScore (kept distinct from confidenceScore for display).
 */
export function scoreWithPeers(
  m: EngineMetrics,
  peers: EngineMetrics[],
): EngineScoreResult {
  const pct = (v: number | null, arr: (number | null)[], lower = false): number | null => {
    if (v == null) return null;
    const valid = arr.filter((x): x is number => x != null);
    if (valid.length <= 1) return null;
    return percentileOf(valid, v, lower);
  };

  /** Weighted average of percentile components; returns null if none available. */
  const weighted = (comps: { p: number | null; w: number }[]): number | null => {
    let sum = 0, totalW = 0;
    for (const { p, w } of comps) {
      if (p == null) continue;
      sum += p * w;
      totalW += w;
    }
    return totalW > 0 ? sum / totalW : null;
  };

  // ─── Risk (30%) — Sharpe(8) + Sortino(8) + MaxDD(8, lower=better) + DownsideCapture(6, lower=better)
  const riskScore = weighted([
    { p: pct(m.sharpe,          peers.map(p => p.sharpe)),                  w: 8 },
    { p: pct(m.sortino,         peers.map(p => p.sortino)),                 w: 8 },
    { p: pct(m.maxDrawdown,     peers.map(p => p.maxDrawdown),     true),   w: 8 },
    { p: pct(m.downsideCapture, peers.map(p => p.downsideCapture), true),   w: 6 },
  ]);

  // ─── Performance (25%) — 3Y Mean Rolling(8) + 5Y Mean Rolling(12) + Median Rolling(5)
  const performanceScore = weighted([
    { p: pct(m.rollingReturn3yAvg,    peers.map(p => p.rollingReturn3yAvg)),    w: 8 },
    { p: pct(m.rollingReturn5yAvg,    peers.map(p => p.rollingReturn5yAvg)),    w: 12 },
    { p: pct(m.medianRollingReturn3y, peers.map(p => p.medianRollingReturn3y)), w: 5 },
  ]);

  // ─── Consistency (20%) — Benchmark Outperformance Freq(8) + Peer Outperformance Freq(7) + Quartile Consistency(5)
  const peerBeatRate = (() => {
    const peerVals = peers.map(p => p.rollingReturn3yAvg).filter((x): x is number => x != null);
    if (m.rollingReturn3yAvg == null || peerVals.length <= 1) return null;
    const beaten = peerVals.filter(v => m.rollingReturn3yAvg! > v).length;
    return (beaten / peerVals.length) * 100;
  })();

  // Quartile Consistency — % of rolling 3Y windows landing in the top half (above median)
  // of this fund's own rolling-return distribution that ALSO beat the category median
  // rolling 3Y return. Approximated via: this fund's rolling 3Y mean vs the category's
  // median rolling 3Y mean, percentile-ranked across peers.
  const quartileConsistency = pct(
    m.rollingReturn3yAvg,
    peers.map(p => p.rollingReturn3yAvg),
  );

  const consistencyScore = weighted([
    { p: m.consistencyBeatRate != null ? m.consistencyBeatRate * 100 : null, w: 8 },
    { p: peerBeatRate,                                                        w: 7 },
    { p: quartileConsistency,                                                 w: 5 },
  ]);

  // ─── Benchmark Skill (10%) — Information Ratio(6) + Alpha(4)
  const benchmarkSkillScore = weighted([
    { p: pct(m.informationRatio, peers.map(p => p.informationRatio)), w: 6 },
    { p: pct(m.longRunAlpha,      peers.map(p => p.longRunAlpha)),     w: 4 },
  ]);

  // ─── Portfolio Quality (10%) & Manager Quality (5%) — not derivable from NAV history
  const portfolioQualityScore: number | null = null;
  const managerQualityScore: number | null = null;

  // Base category weights per spec
  const CATEGORY_WEIGHTS = {
    risk: 0.30,
    performance: 0.25,
    consistency: 0.20,
    benchmarkSkill: 0.10,
    portfolioQuality: 0.10,
    managerQuality: 0.05,
  };

  const categoryScores: Record<keyof typeof CATEGORY_WEIGHTS, number | null> = {
    risk: riskScore,
    performance: performanceScore,
    consistency: consistencyScore,
    benchmarkSkill: benchmarkSkillScore,
    portfolioQuality: portfolioQualityScore,
    managerQuality: managerQualityScore,
  };

  // Redistribute weight of unavailable categories proportionally across available ones
  let availableWeight = 0;
  let unavailableWeight = 0;
  for (const key of Object.keys(CATEGORY_WEIGHTS) as (keyof typeof CATEGORY_WEIGHTS)[]) {
    if (categoryScores[key] != null) availableWeight += CATEGORY_WEIGHTS[key];
    else unavailableWeight += CATEGORY_WEIGHTS[key];
  }

  let fundScore = 50; // neutral fallback if nothing is available
  if (availableWeight > 0) {
    const redistributionFactor = (availableWeight + unavailableWeight) / availableWeight;
    let sum = 0;
    for (const key of Object.keys(CATEGORY_WEIGHTS) as (keyof typeof CATEGORY_WEIGHTS)[]) {
      const score = categoryScores[key];
      if (score == null) continue;
      sum += score * CATEGORY_WEIGHTS[key] * redistributionFactor;
    }
    fundScore = Math.round(sum);
  }

  const conf = computeConfidenceScore(m);
  // Fund Score and Confidence Score are kept separate — finalScore === fundScore.
  const finalScore = fundScore;
  const { rating, color } = getRating(finalScore);

  return {
    fundScore,
    confidenceScore: conf,
    finalScore,
    rating,
    ratingColor: color,
    pillars: {
      risk:             { rawScore: riskScore ?? 0,           weight: CATEGORY_WEIGHTS.risk * 100,             label: "Risk",               available: riskScore != null },
      performance:      { rawScore: performanceScore ?? 0,    weight: CATEGORY_WEIGHTS.performance * 100,      label: "Performance",        available: performanceScore != null },
      consistency:      { rawScore: consistencyScore ?? 0,    weight: CATEGORY_WEIGHTS.consistency * 100,      label: "Consistency",        available: consistencyScore != null },
      benchmarkSkill:   { rawScore: benchmarkSkillScore ?? 0,  weight: CATEGORY_WEIGHTS.benchmarkSkill * 100,   label: "Benchmark Skill",    available: benchmarkSkillScore != null },
      portfolioQuality: { rawScore: 0,                         weight: CATEGORY_WEIGHTS.portfolioQuality * 100, label: "Portfolio Quality",  available: false },
      managerQuality:   { rawScore: 0,                         weight: CATEGORY_WEIGHTS.managerQuality * 100,   label: "Manager Quality",    available: false },
    },
  };
}

// ─── Strengths & Weaknesses summary ────────────────────────────────────────

export interface StrengthsWeaknesses {
  strengths: string[];
  weaknesses: string[];
}

/**
 * Strengths are categories scoring ≥ 70 (top-quartile-ish percentile),
 * weaknesses are categories scoring < 50 (below category median).
 * Unavailable categories (Portfolio Quality, Manager Quality without data)
 * are excluded from both lists — they are shown separately as
 * "Data Not Available" in the UI.
 */
export function getStrengthsWeaknesses(
  pillars: EngineScoreResult["pillars"],
): StrengthsWeaknesses {
  const entries = Object.values(pillars).filter((p) => p.available);
  const strengths = entries
    .filter((p) => p.rawScore >= 70)
    .sort((a, b) => b.rawScore - a.rawScore)
    .map((p) => p.label);
  const weaknesses = entries
    .filter((p) => p.rawScore < 50)
    .sort((a, b) => a.rawScore - b.rawScore)
    .map((p) => p.label);
  return { strengths, weaknesses };
}
