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
 *   2. Short-Term Performance         5%  1M/3M/6M returns
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
  trackingError: number | null;     // Phase 2
  longRunAlpha: number | null;
  jensensAlpha: number | null;      // Phase 2
  consistencyBeatRate: number | null;
  bearMarketReturn: number | null;  // Phase 2
}

export function computeBenchmarkMetrics(
  series: NavPoint[],
  benchmark: NavPoint[],
): BenchmarkMetrics {
  // Long-run alpha (raw CAGR diff)
  const benchCAGR3Y = trailingCAGR(benchmark, 3);
  const fundCAGR3Y  = trailingCAGR(series, 3);
  const longRunAlpha =
    fundCAGR3Y != null && benchCAGR3Y != null ? fundCAGR3Y - benchCAGR3Y : null;

  // Consistency Bonus — % of rolling 3Y windows beating benchmark
  const consistencyBeatRate = rollingAlphaRate(series, benchmark, 3);

  const benchMap = new Map(benchmark.map(p => [p.d, p.nav]));

  // Aligned daily log returns
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

  // Beta
  const fM = pairs.reduce((s, p) => s + p.f, 0) / pairs.length;
  const bM = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
  let cov = 0, varB = 0;
  for (const { f, b } of pairs) { cov += (f - fM) * (b - bM); varB += (b - bM) ** 2; }
  const beta = varB > 0 ? cov / varB : null;

  // Tracking Error + Information Ratio (same computation pass)
  const excess = pairs.map(p => p.f - p.b);
  const exM = excess.reduce((a, e) => a + e, 0) / excess.length;
  const exV = excess.reduce((s, e) => s + (e - exM) ** 2, 0) / (excess.length - 1);
  const te  = Math.sqrt(exV * TRADING_DAYS_PER_YEAR);
  const trackingError    = te > 0 ? te : null;
  const informationRatio = te > 0 ? (exM * TRADING_DAYS_PER_YEAR) / te : null;

  // Jensen's Alpha = annFundReturn − (RFR + β × (annBenchReturn − RFR))
  // Uses 3Y CAGR as the annualised return proxy
  const jensensAlpha =
    fundCAGR3Y != null && benchCAGR3Y != null && beta != null
      ? fundCAGR3Y - (RISK_FREE_RATE_ANNUAL + beta * (benchCAGR3Y - RISK_FREE_RATE_ANNUAL))
      : null;

  // Monthly aggregates for capture ratios + bear market return
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

  // Bear Market Return — fund's average annualised return during down benchmark months.
  // Higher (less negative) = fund preserves more capital in bear markets = better manager.
  const bearMarketReturn = dN >= 6 ? (dFS / dN) * 12 : null; // monthly avg × 12 = annualised

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
  /** % rolling 3Y windows where fund beat category benchmark (or % positive if no benchmark). */
  consistencyBeatRate: number | null;

  // Pillar 2 — Short-Term Performance
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
  /** Beta-adjusted outperformance vs benchmark — proxy for low expense ratio impact. */
  jensensAlpha:  number | null;
  /** StdDev of excess daily returns, annualised — lower = less wasted active risk. */
  trackingError: number | null;
  /** Raw CAGR diff (legacy, still stored for display). */
  longRunAlpha:  number | null;

  // Pillar 6 — Portfolio Quality (Phase 2: Calmar 4 + Omega 5 + Rolling StdDev 3)
  calmarRatio:  number | null;
  /** Probability-weighted return quality above RFR — higher = better portfolio construction. */
  omegaRatio:   number | null;
  rollingStdDev: number | null;

  // Pillar 7 — Management & AUM (Phase 2: Longevity 1 + Rolling 1Y+ 2 + Bear Mkt Return 2)
  rollingPos1y:     number | null;
  /**
   * Annualised fund return during benchmark down-months.
   * Higher (less negative) = fund preserves capital in bear markets = better management.
   */
  bearMarketReturn: number | null;

  historyYears: number;
  dataPoints:   number;
}

// ─── Annual Return Average helper ────────────────────────────────────────────
// Average of all available 1-year rolling simple returns.
// Samples up to 200 windows across the full series for performance.

function computeAnnualReturnAvg(series: NavPoint[]): number | null {
  if (series.length < 252) return null;
  const step = Math.max(1, Math.floor(series.length / 200));
  const returns: number[] = [];
  for (let i = 252; i < series.length; i += step) {
    const r = series[i].nav / series[i - 252].nav - 1;
    if (isFinite(r)) returns.push(r);
  }
  if (returns.length === 0) return null;
  return returns.reduce((a, b) => a + b, 0) / returns.length;
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

  // Consistency Bonus fallback when no benchmark
  const consistencyBeatRate = bm.consistencyBeatRate ?? rollingPositiveRate(series, 3);

  return {
    cagr3y,
    cagr5y:  trailingCAGR(series, 5),
    cagr7y:  trailingCAGR(series, 7),
    cagr10y: trailingCAGR(series, 10),
    consistencyBeatRate,

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

    rollingPos1y:     rollingPositiveRate(series, 1),
    bearMarketReturn: bm.bearMarketReturn,

    historyYears,
    dataPoints: series.length,
  };
}

// ─── Confidence Score (spec-compliant) ───────────────────────────────────────
//
// Fund Age (70%): <3Y→40, 3-5Y→60, 5-7Y→75, 7-10Y→90, 10+Y→100
// Data Completeness (30%): >95%→100, 90-95%→80, 80-90%→60, <80%→40

export function computeConfidenceScore(m: EngineMetrics): number {
  const ageScore =
    m.historyYears >= 10 ? 100 :
    m.historyYears >=  7 ?  90 :
    m.historyYears >=  5 ?  75 :
    m.historyYears >=  3 ?  60 : 40;

  const keys: (keyof EngineMetrics)[] = [
    "cagr3y", "sharpe", "sortino", "maxDrawdown", "stdDev",
    "consistencyBeatRate", "informationRatio", "downsideCapture",
    "jensensAlpha", "calmarRatio", "omegaRatio", "bearMarketReturn",
  ];
  const avail   = keys.filter(k => m[k] != null).length;
  const pct     = avail / keys.length;
  const compScore = pct > 0.95 ? 100 : pct > 0.90 ? 80 : pct > 0.80 ? 60 : 40;

  return Math.round(ageScore * 0.70 + compScore * 0.30);
}

// ─── Rating bands ─────────────────────────────────────────────────────────────

export function getRating(score: number): { rating: string; color: string; bg: string } {
  if (score >= 90) return { rating: "Elite",         color: "text-cyan",     bg: "bg-cyan/10 border-cyan/30" };
  if (score >= 85) return { rating: "Excellent",     color: "text-positive", bg: "bg-positive/10 border-positive/30" };
  if (score >= 80) return { rating: "Strong",        color: "text-positive", bg: "bg-positive/10 border-positive/30" };
  if (score >= 75) return { rating: "Above Average", color: "text-positive", bg: "bg-positive/10 border-positive/30" };
  if (score >= 65) return { rating: "Average",       color: "text-warning",  bg: "bg-warning/10 border-warning/30" };
  if (score >= 50) return { rating: "Weak",          color: "text-warning",  bg: "bg-warning/10 border-warning/30" };
  return              { rating: "Avoid",             color: "text-negative", bg: "bg-negative/10 border-negative/30" };
}

// ─── Score result types ───────────────────────────────────────────────────────

export interface PillarScore {
  rawScore:       number;
  nominalWeight:  number;
  effectiveWeight:number;
  available:      boolean;
  metricsUsed:    number;
  metricsTotal:   number;
  isProxy:        boolean;
}

export interface EngineScoreResult {
  /** Pure fund quality score (0–100), category-relative percentile. */
  fundScore: number;
  /**
   * Final Published Score = round(fundScore × 0.90 + confidenceScore × 0.10).
   * Primary number shown to users. Penalises short-history funds.
   */
  finalScore:      number;
  confidenceScore: number;
  rating:          string;
  ratingColor:     string;
  pillars: {
    longTermConsistency:  PillarScore;
    shortTermPerformance: PillarScore;
    riskAdjusted:         PillarScore;
    downsideProtection:   PillarScore;
    costEfficiency:       PillarScore;
    portfolioQuality:     PillarScore;
    managementAUM:        PillarScore;
  };
}

// ─── Pillar scorer — local redistribution ────────────────────────────────────
//
// rawScore = weightedSum / availableWeight  →  missing weight stays within pillar
// effectiveWeight = nominalWeight when ≥1 metric is available

interface MetricInput { v: number | null; w: number; peers: number[]; lower?: boolean; }

function scorePillar(
  metrics: MetricInput[],
  nominalWeight: number,
  isProxy: boolean,
): PillarScore {
  let availW = 0, scoreSum = 0, used = 0;
  for (const { v, w, peers, lower } of metrics) {
    if (v == null || peers.length <= 1) continue;
    scoreSum += percentileOf(peers, v, lower) * w;
    availW += w;
    used++;
  }
  if (availW === 0) {
    return { rawScore: 0, nominalWeight, effectiveWeight: 0,
             available: false, metricsUsed: 0, metricsTotal: metrics.length, isProxy };
  }
  return {
    rawScore: scoreSum / availW,
    nominalWeight,
    effectiveWeight: nominalWeight,
    available:       true,
    metricsUsed:     used,
    metricsTotal:    metrics.length,
    isProxy,
  };
}

// ─── Score with peer context ──────────────────────────────────────────────────

export function scoreWithPeers(
  m: EngineMetrics,
  peers: EngineMetrics[],
): EngineScoreResult {
  const pv = <K extends keyof EngineMetrics>(key: K): number[] =>
    peers.map(p => p[key] as number | null).filter((v): v is number => v != null);

  // ── Pillar 1: Long-Term Consistency (23%) ─────────────────────────────────
  const ltc = scorePillar([
    { v: m.cagr3y,              w: 5, peers: pv("cagr3y") },
    { v: m.cagr5y,              w: 6, peers: pv("cagr5y") },
    { v: m.cagr7y,              w: 5, peers: pv("cagr7y") },
    { v: m.cagr10y,             w: 4, peers: pv("cagr10y") },
    { v: m.consistencyBeatRate, w: 3, peers: pv("consistencyBeatRate") },
  ], 23, false);

  // ── Pillar 2: Short-Term Performance (5%) ─────────────────────────────────
  const stp = scorePillar([
    { v: m.ret1m, w: 1, peers: pv("ret1m") },
    { v: m.ret3m, w: 2, peers: pv("ret3m") },
    { v: m.ret6m, w: 2, peers: pv("ret6m") },
  ], 5, false);

  // ── Pillar 3: Risk-Adjusted (20%) ─────────────────────────────────────────
  const ra = scorePillar([
    { v: m.sortino,          w: 10, peers: pv("sortino") },
    { v: m.sharpe,           w:  6, peers: pv("sharpe") },
    { v: m.informationRatio, w:  4, peers: pv("informationRatio") },
  ], 20, false);

  // ── Pillar 4: Downside Protection (20%) ───────────────────────────────────
  const dp = scorePillar([
    { v: m.downsideCapture, w: 8, peers: pv("downsideCapture"), lower: true  },
    { v: m.upsideCapture,   w: 3, peers: pv("upsideCapture"),   lower: false },
    { v: m.maxDrawdown,     w: 4, peers: pv("maxDrawdown"),     lower: true  },
    { v: m.recoveryMonths,  w: 3, peers: pv("recoveryMonths"),  lower: true  },
    { v: m.beta,            w: 1, peers: pv("beta"),            lower: true  },
    { v: m.stdDev,          w: 1, peers: pv("stdDev"),          lower: true  },
  ], 20, false);

  // ── Pillar 5: Cost Efficiency (15%) — Phase 2 ─────────────────────────────
  // Jensen's Alpha (9): beta-adjusted outperformance; better proxy for low
  //   expense ratio impact than raw CAGR diff.
  // Tracking Error (6, lower): less wasted active risk = more cost-efficient.
  const ce = scorePillar([
    { v: m.jensensAlpha,  w: 9, peers: pv("jensensAlpha") },
    { v: m.trackingError, w: 6, peers: pv("trackingError"), lower: true },
  ], 15, true);

  // ── Pillar 6: Portfolio Quality (12%) — Phase 2 ───────────────────────────
  // Omega Ratio (5): probability-weighted return quality.
  // Calmar Ratio (4): return per unit of max drawdown.
  // Rolling Return StdDev (3, lower): consistent returns = stable portfolio.
  const pq = scorePillar([
    { v: m.calmarRatio,   w: 4, peers: pv("calmarRatio") },
    { v: m.omegaRatio,    w: 5, peers: pv("omegaRatio") },
    { v: m.rollingStdDev, w: 3, peers: pv("rollingStdDev"), lower: true },
  ], 12, true);

  // ── Pillar 7: Management & AUM (5%) — Phase 2 ────────────────────────────
  // Bear Market Return (2): fund performance during benchmark down-months.
  //   Higher (less negative) = manager preserves capital better.
  // Rolling 1Y+ (2): % of rolling 1Y windows with positive return.
  // Longevity (1): years of verified NAV history.
  const ma = scorePillar([
    { v: m.historyYears,     w: 1, peers: pv("historyYears") },
    { v: m.rollingPos1y,     w: 2, peers: pv("rollingPos1y") },
    { v: m.bearMarketReturn, w: 2, peers: pv("bearMarketReturn") },
  ], 5, true);

  // ── Fund Score ────────────────────────────────────────────────────────────
  const ps = [ltc, stp, ra, dp, ce, pq, ma];
  const totalEffW = ps.reduce((s, p) => s + p.effectiveWeight, 0);
  const fundScore = totalEffW > 0
    ? Math.max(0, Math.min(100, Math.round(
        ps.reduce((s, p) => s + p.rawScore * p.effectiveWeight, 0) / totalEffW,
      )))
    : 0;

  // ── Confidence + Final Published Score ───────────────────────────────────
  const conf       = computeConfidenceScore(m);
  const finalScore = Math.max(0, Math.min(100, Math.round(fundScore * 0.90 + conf * 0.10)));

  const { rating, color: ratingColor } = getRating(finalScore);

  return {
    fundScore, finalScore, confidenceScore: conf, rating, ratingColor,
    pillars: {
      longTermConsistency:  ltc,
      shortTermPerformance: stp,
      riskAdjusted:         ra,
      downsideProtection:   dp,
      costEfficiency:       ce,
      portfolioQuality:     pq,
      managementAUM:        ma,
    },
  };
}

// ─── Strengths / Weaknesses ───────────────────────────────────────────────────

export function getStrengthsWeaknesses(pillars: EngineScoreResult["pillars"]): {
  strengths: string[];
  weaknesses: string[];
} {
  const entries = [
    { name: "Long-Term Consistency",  p: pillars.longTermConsistency },
    { name: "Short-Term Performance", p: pillars.shortTermPerformance },
    { name: "Risk-Adjusted Returns",  p: pillars.riskAdjusted },
    { name: "Downside Protection",    p: pillars.downsideProtection },
    { name: "Cost Efficiency",        p: pillars.costEfficiency },
    { name: "Portfolio Quality",      p: pillars.portfolioQuality },
    { name: "Management",             p: pillars.managementAUM },
  ].filter(e => e.p.available);

  entries.sort((a, b) => b.p.rawScore - a.p.rawScore);
  return {
    strengths:  entries.slice(0, 2).filter(e => e.p.rawScore >= 65).map(e => e.name),
    weaknesses: entries.slice(-2).filter(e => e.p.rawScore < 40).map(e => e.name),
  };
}
