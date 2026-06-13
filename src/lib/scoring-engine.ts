/**
 * scoring-engine.ts — Production Mutual Fund Scoring Engine
 *
 * Pillar status:
 *
 *   Pillar                       Nominal  Status
 *   ─────────────────────────────────────────────────────────────────────────
 *   1. Long-Term Consistency         23%  ✓ CAGR 3Y/5Y/7Y/10Y + consistency
 *   2. Short-Term Performance         5%  ✓ 1M/3M/6M returns
 *   3. Risk-Adjusted Performance     20%  ✓ Sortino + Sharpe + IR (via benchmark)
 *   4. Downside Protection           20%  ✓ Downside/Upside Capture + MaxDD +
 *                                            Recovery + Beta + StdDev (via benchmark)
 *   5. Cost Efficiency               15%  ✗ Needs expense-ratio feed — Phase 2
 *   6. Portfolio Quality             12%  ✗ Needs portfolio holdings feed — Phase 2
 *   7. Management & AUM               5%  ✗ Needs AUM / manager feed — Phase 2
 *
 * To score with full Pillar 3+4 metrics, call:
 *   const bench = buildBenchmark(allPeerSeries)
 *   const m = computeEngineMetrics(series, bench)
 *
 * All rankings are CATEGORY-SCOPED. Cross-category comparison is invalid.
 */

import type { NavPoint } from "./nav-history";
import { RISK_FREE_RATE_ANNUAL, TRADING_DAYS_PER_YEAR } from "./risk-free-rate";

const MS_PER_DAY = 86_400_000;
const YEAR_MS = 365 * MS_PER_DAY;

// ─── Low-level math helpers ───────────────────────────────────────────────────

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
  if (years >= 1) return Math.pow(end.nav / start.nav, 1 / actual) - 1;
  return end.nav / start.nav - 1;
}

function logReturns(series: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const r = Math.log(series[i].nav / series[i - 1].nav);
    if (isFinite(r)) out.push(r);
  }
  return out;
}

function annualisedStdDev(lRets: number[]): number | null {
  if (lRets.length < 30) return null;
  const m = lRets.reduce((a, b) => a + b, 0) / lRets.length;
  const v = lRets.reduce((s, r) => s + (r - m) ** 2, 0) / (lRets.length - 1);
  return Math.sqrt(v * TRADING_DAYS_PER_YEAR);
}

function annualisedDownsideVol(lRets: number[]): number | null {
  if (lRets.length < 30) return null;
  const neg = lRets.filter((r) => r < 0);
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
  const minWindowMs = windowMs * 0.85;
  let pos = 0, total = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const start = navAtOrBefore(series, series[i].t - windowMs);
    if (!start) break;
    const span = series[i].t - start.t;
    if (span < minWindowMs) continue;
    total++;
    if (series[i].nav > start.nav) pos++;
  }
  return total >= 8 ? pos / total : null;
}

function percentileOf(arr: number[], v: number, lowerIsBetter = false): number {
  if (arr.length <= 1) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter((x) => x < v).length;
  const equal = sorted.filter((x) => x === v).length;
  const p = ((below + equal * 0.5) / sorted.length) * 100;
  return lowerIsBetter ? 100 - p : p;
}

// ─── Category benchmark builder ───────────────────────────────────────────────

/**
 * Builds an equal-weighted category benchmark series from all peer NAV histories.
 * Each peer is normalised to 100 at its first date, then averaged across peers
 * for each calendar date where ≥3 peers have data.
 *
 * Returns null if fewer than 5 peers or fewer than 100 benchmark dates.
 */
export function buildBenchmark(peerSeries: NavPoint[][]): NavPoint[] | null {
  if (peerSeries.length < 5) return null;

  const dateMap = new Map<string, number[]>(); // ISO date → [normalised NAVs]

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

// ─── Benchmark-relative metric computation ────────────────────────────────────

interface BenchmarkMetrics {
  beta: number | null;
  downsideCapture: number | null; // as a %, e.g. 85 = 85% downside capture
  upsideCapture: number | null;
  informationRatio: number | null;
}

/**
 * Computes Beta, Capture Ratios, and Information Ratio against the category
 * equal-weighted benchmark.  Requires aligned daily overlapping dates.
 */
export function computeBenchmarkMetrics(
  series: NavPoint[],
  benchmark: NavPoint[],
): BenchmarkMetrics {
  const benchMap = new Map(benchmark.map((p) => [p.d, p.nav]));

  // Collect aligned daily log returns
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
    return { beta: null, downsideCapture: null, upsideCapture: null, informationRatio: null };
  }

  // ── Beta ──────────────────────────────────────────────────────────────────
  const fMean = pairs.reduce((s, p) => s + p.f, 0) / pairs.length;
  const bMean = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
  let cov = 0, varB = 0;
  for (const { f, b } of pairs) {
    cov += (f - fMean) * (b - bMean);
    varB += (b - bMean) ** 2;
  }
  const beta = varB > 0 ? cov / varB : null;

  // ── Information Ratio ────────────────────────────────────────────────────
  const excess = pairs.map((p) => p.f - p.b);
  const exMean = excess.reduce((a, e) => a + e, 0) / excess.length;
  const exVar = excess.reduce((s, e) => s + (e - exMean) ** 2, 0) / (excess.length - 1);
  const trackingError = Math.sqrt(exVar * TRADING_DAYS_PER_YEAR);
  const informationRatio = trackingError > 0
    ? (exMean * TRADING_DAYS_PER_YEAR) / trackingError
    : null;

  // ── Capture ratios (monthly) ─────────────────────────────────────────────
  // Aggregate daily log returns by YYYY-MM to get monthly returns
  type MonthlyReturns = Map<string, { f: number; b: number }>;
  const monthly: MonthlyReturns = new Map();

  for (let i = 1; i < series.length; i++) {
    const bCurr = benchMap.get(series[i].d);
    const bPrev = benchMap.get(series[i - 1].d);
    if (bCurr == null || bPrev == null) continue;
    const ym = series[i].d.slice(0, 7); // "YYYY-MM"
    const f = Math.log(series[i].nav / series[i - 1].nav);
    const b = Math.log(bCurr / bPrev);
    if (!isFinite(f) || !isFinite(b)) continue;
    const cur = monthly.get(ym) ?? { f: 0, b: 0 };
    monthly.set(ym, { f: cur.f + f, b: cur.b + b });
  }

  let downFSum = 0, downBSum = 0, downN = 0;
  let upFSum = 0, upBSum = 0, upN = 0;

  for (const { f, b } of monthly.values()) {
    if (b < 0) { downFSum += f; downBSum += b; downN++; }
    else if (b > 0) { upFSum += f; upBSum += b; upN++; }
  }

  const downsideCapture = downN >= 6 && downBSum !== 0
    ? (downFSum / downBSum) * 100 : null;
  const upsideCapture = upN >= 6 && upBSum !== 0
    ? (upFSum / upBSum) * 100 : null;

  return { beta, downsideCapture, upsideCapture, informationRatio };
}

// ─── Public metric types ──────────────────────────────────────────────────────

export interface EngineMetrics {
  // Pillar 1 — Long-Term Consistency
  cagr3y: number | null;
  cagr5y: number | null;
  cagr7y: number | null;
  cagr10y: number | null;
  rollingPos3y: number | null; // fraction 0-1

  // Pillar 2 — Short-Term Performance
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;

  // Pillar 3 — Risk-Adjusted
  sharpe: number | null;
  sortino: number | null;
  informationRatio: number | null;   // requires benchmark

  // Pillar 4 — Downside Protection
  maxDrawdown: number | null;        // value in (-1, 0]
  recoveryMonths: number | null;
  stdDev: number | null;             // annualized
  beta: number | null;               // vs category benchmark
  downsideCapture: number | null;    // % e.g. 85 = good
  upsideCapture: number | null;      // % e.g. 110 = good

  historyYears: number;
  dataPoints: number;
}

// ─── Step 1 — Compute metrics for one fund ────────────────────────────────────

export function computeEngineMetrics(
  series: NavPoint[],
  benchmark?: NavPoint[] | null,
): EngineMetrics {
  const historyYears =
    series.length > 1
      ? (series[series.length - 1].t - series[0].t) / YEAR_MS
      : 0;

  const lRets = logReturns(series);
  const vol = annualisedStdDev(lRets);
  const ddVol = annualisedDownsideVol(lRets);
  const r3y = trailingCAGR(series, 3) ?? trailingCAGR(series, 1);

  const sharpe = r3y != null && vol != null && vol > 0
    ? (r3y - RISK_FREE_RATE_ANNUAL) / vol : null;
  const sortino = r3y != null && ddVol != null && ddVol > 0
    ? (r3y - RISK_FREE_RATE_ANNUAL) / ddVol : null;

  const bmMetrics = benchmark
    ? computeBenchmarkMetrics(series, benchmark)
    : { beta: null, downsideCapture: null, upsideCapture: null, informationRatio: null };

  return {
    cagr3y: trailingCAGR(series, 3),
    cagr5y: trailingCAGR(series, 5),
    cagr7y: trailingCAGR(series, 7),
    cagr10y: trailingCAGR(series, 10),
    rollingPos3y: rollingPositiveRate(series, 3),

    ret1m: trailingCAGR(series, 1 / 12),
    ret3m: trailingCAGR(series, 3 / 12),
    ret6m: trailingCAGR(series, 6 / 12),

    sharpe,
    sortino,
    informationRatio: bmMetrics.informationRatio,

    maxDrawdown: maxDrawdown(series),
    recoveryMonths: recoveryMonths(series),
    stdDev: vol,
    beta: bmMetrics.beta,
    downsideCapture: bmMetrics.downsideCapture,
    upsideCapture: bmMetrics.upsideCapture,

    historyYears,
    dataPoints: series.length,
  };
}

// ─── Confidence Score ─────────────────────────────────────────────────────────

export function computeConfidenceScore(m: EngineMetrics): number {
  const ageScore =
    m.historyYears >= 10 ? 100
    : m.historyYears >= 7 ? 90
    : m.historyYears >= 5 ? 75
    : m.historyYears >= 3 ? 60
    : 40;

  const keys: (keyof EngineMetrics)[] = [
    "cagr3y", "sharpe", "sortino", "maxDrawdown", "stdDev",
    "rollingPos3y", "informationRatio", "downsideCapture",
  ];
  const avail = keys.filter((k) => m[k] != null).length;
  const completenessScore =
    avail / keys.length > 0.95 ? 100
    : avail / keys.length > 0.85 ? 80
    : avail / keys.length > 0.7 ? 60
    : 40;

  return Math.round(ageScore * 0.7 + completenessScore * 0.3);
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

// ─── Score types ──────────────────────────────────────────────────────────────

export interface PillarScore {
  rawScore: number;
  contribution: number;
  nominalWeight: number;
  effectiveWeight: number;
  available: boolean;
  metricsUsed: number;
  metricsTotal: number;
}

export interface EngineScoreResult {
  fundScore: number;
  confidenceScore: number;
  rating: string;
  ratingColor: string;
  pillars: {
    longTermConsistency: PillarScore;
    shortTermPerformance: PillarScore;
    riskAdjusted: PillarScore;
    downsideProtection: PillarScore;
    costEfficiency: PillarScore;
    portfolioQuality: PillarScore;
    managementAUM: PillarScore;
  };
}

// ─── Step 2-4 — Score with peer context ──────────────────────────────────────

export function scoreWithPeers(
  m: EngineMetrics,
  peers: EngineMetrics[],
): EngineScoreResult {
  const pv = <K extends keyof EngineMetrics>(key: K): number[] =>
    peers.map((p) => p[key] as number | null).filter((v): v is number => v != null);

  // ── Pillar 1: Long-Term Consistency (23%) ────────────────────────────────
  // Weights: 3Y(5) 5Y(6) 7Y(5) 10Y(4) Consistency(3)
  const ltc = scorePillar([
    { v: m.cagr3y,       w: 5, peers: pv("cagr3y") },
    { v: m.cagr5y,       w: 6, peers: pv("cagr5y") },
    { v: m.cagr7y,       w: 5, peers: pv("cagr7y") },
    { v: m.cagr10y,      w: 4, peers: pv("cagr10y") },
    { v: m.rollingPos3y, w: 3, peers: pv("rollingPos3y") },
  ], 23);

  // ── Pillar 2: Short-Term Performance (5%) ────────────────────────────────
  // Weights: 1M(1) 3M(2) 6M(2)
  const stp = scorePillar([
    { v: m.ret1m, w: 1, peers: pv("ret1m") },
    { v: m.ret3m, w: 2, peers: pv("ret3m") },
    { v: m.ret6m, w: 2, peers: pv("ret6m") },
  ], 5);

  // ── Pillar 3: Risk-Adjusted Performance (20%) ─────────────────────────────
  // Weights: Sortino(10) Sharpe(6) IR(4) — all now available via benchmark
  const ra = scorePillar([
    { v: m.sortino,         w: 10, peers: pv("sortino") },
    { v: m.sharpe,          w: 6,  peers: pv("sharpe") },
    { v: m.informationRatio,w: 4,  peers: pv("informationRatio") },
  ], 20);

  // ── Pillar 4: Downside Protection (20%) ──────────────────────────────────
  // Weights: Downside Capture(8) Upside Capture(3) MaxDD(4) Recovery(3) Beta(1) StdDev(1)
  // Note: downsideCapture lower = better (fund goes down more); beta lower = better for defensiveness
  // upsideCapture higher = better (but spec says downside valued more)
  const dp = scorePillar([
    { v: m.downsideCapture,  w: 8, peers: pv("downsideCapture"), lower: true },
    { v: m.upsideCapture,    w: 3, peers: pv("upsideCapture"),   lower: false },
    { v: m.maxDrawdown,      w: 4, peers: pv("maxDrawdown"),     lower: true },
    { v: m.recoveryMonths,   w: 3, peers: pv("recoveryMonths"),  lower: true },
    { v: m.beta,             w: 1, peers: pv("beta"),            lower: true },
    { v: m.stdDev,           w: 1, peers: pv("stdDev"),          lower: true },
  ], 20);

  // ── Pillars 5, 6, 7: Phase 2 (data feeds not yet integrated) ─────────────
  const phase2 = (w: number): PillarScore => ({
    rawScore: 0, contribution: 0, nominalWeight: w,
    effectiveWeight: 0, available: false, metricsUsed: 0, metricsTotal: 0,
  });

  const ce = phase2(15);
  const pq = phase2(12);
  const ma = phase2(5);

  // ── Final score — normalize by available weight ───────────────────────────
  const ps = [ltc, stp, ra, dp, ce, pq, ma];
  const totalEffW = ps.reduce((s, p) => s + p.effectiveWeight, 0);

  let fundScore = 0;
  if (totalEffW > 0) {
    fundScore = Math.max(0, Math.min(100, Math.round(
      ps.reduce((s, p) => s + p.rawScore * p.effectiveWeight, 0) / totalEffW,
    )));
  }

  const conf = computeConfidenceScore(m);
  const { rating, color: ratingColor } = getRating(fundScore);

  return {
    fundScore, confidenceScore: conf, rating, ratingColor,
    pillars: {
      longTermConsistency: ltc, shortTermPerformance: stp,
      riskAdjusted: ra, downsideProtection: dp,
      costEfficiency: ce, portfolioQuality: pq, managementAUM: ma,
    },
  };
}

// ─── Internal pillar scorer ───────────────────────────────────────────────────

interface MetricInput {
  v: number | null;
  w: number;
  peers: number[];
  lower?: boolean;
}

function scorePillar(metrics: MetricInput[], nominalWeight: number): PillarScore {
  let availW = 0, scoreSum = 0, metricsUsed = 0;
  for (const { v, w, peers, lower } of metrics) {
    if (v == null || peers.length <= 1) continue;
    scoreSum += percentileOf(peers, v, lower) * w;
    availW += w;
    metricsUsed++;
  }
  if (availW === 0) {
    return {
      rawScore: 0, contribution: 0, nominalWeight,
      effectiveWeight: 0, available: false,
      metricsUsed: 0, metricsTotal: metrics.length,
    };
  }
  const rawScore = scoreSum / availW;
  return {
    rawScore, contribution: rawScore * nominalWeight, nominalWeight,
    effectiveWeight: nominalWeight, available: true,
    metricsUsed, metricsTotal: metrics.length,
  };
}

// ─── Strengths / Weaknesses ───────────────────────────────────────────────────

export function getStrengthsWeaknesses(pillars: EngineScoreResult["pillars"]): {
  strengths: string[];
  weaknesses: string[];
} {
  const entries = [
    { name: "Long-Term Consistency", p: pillars.longTermConsistency },
    { name: "Short-Term Performance", p: pillars.shortTermPerformance },
    { name: "Risk-Adjusted Returns", p: pillars.riskAdjusted },
    { name: "Downside Protection", p: pillars.downsideProtection },
  ].filter((e) => e.p.available);

  entries.sort((a, b) => b.p.rawScore - a.p.rawScore);
  return {
    strengths: entries.slice(0, 2).filter((e) => e.p.rawScore >= 65).map((e) => e.name),
    weaknesses: entries.slice(-2).filter((e) => e.p.rawScore < 45).map((e) => e.name),
  };
}
