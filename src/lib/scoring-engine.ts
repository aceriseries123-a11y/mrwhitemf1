/**
 * scoring-engine.ts — Production Mutual Fund Scoring Engine
 *
 * Implements the 7-pillar scoring specification:
 *
 *   Pillar                    Nominal Weight   Status
 *   ─────────────────────────────────────────────────
 *   1. Long-Term Consistency       23%          ✓ computed from NAV
 *   2. Short-Term Performance       5%          ✓ computed from NAV
 *   3. Risk-Adjusted Performance   20%          ✓ Sharpe + Sortino (IR redistributed)
 *   4. Downside Protection         20%          ✓ MaxDD + Recovery + StdDev (captures redistributed)
 *   5. Cost Efficiency             15%          ⚠ unavailable — excluded from score
 *   6. Portfolio Quality           12%          ⚠ unavailable — excluded from score
 *   7. Management & AUM             5%          ⚠ unavailable — excluded from score
 *
 * Missing-data rule: weights are redistributed LOCALLY within each pillar.
 * Entirely unavailable pillars are excluded and the final score is normalized
 * by the sum of available weights (68% in current data environment).
 *
 * All rankings are CATEGORY-SCOPED. Cross-category comparison is invalid.
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

/** CAGR over trailing `years`. Returns null if insufficient history. */
function trailingCAGR(series: NavPoint[], years: number): number | null {
  if (series.length < 2) return null;
  const end = series[series.length - 1];
  const start = navAtOrBefore(series, end.t - years * YEAR_MS);
  if (!start || start.t === end.t) return null;
  const actual = (end.t - start.t) / YEAR_MS;
  if (actual < years * 0.85) return null;
  if (years >= 1) return Math.pow(end.nav / start.nav, 1 / actual) - 1;
  return end.nav / start.nav - 1; // simple return for <1 year
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
  return worst; // negative value: e.g. -0.35 = 35% drawdown
}

/** Months from the max-drawdown peak to full recovery. */
function recoveryMonths(series: NavPoint[]): number | null {
  if (series.length < 30) return null;
  let peak = -Infinity, peakIdx = 0;
  let maxDD = 0, ddPeakIdx = 0;

  for (let i = 0; i < series.length; i++) {
    if (series[i].nav > peak) { peak = series[i].nav; peakIdx = i; }
    const dd = (series[i].nav - peak) / peak;
    if (dd < maxDD) { maxDD = dd; ddPeakIdx = peakIdx; }
  }

  if (maxDD > -0.03) return 0; // trivial drawdown — treat as instant recovery

  const peakNav = series[ddPeakIdx].nav;
  for (let i = ddPeakIdx + 1; i < series.length; i++) {
    if (series[i].nav >= peakNav) {
      return (series[i].t - series[ddPeakIdx].t) / (30 * MS_PER_DAY);
    }
  }
  // Not yet recovered — report elapsed time since peak (still recovering)
  return (series[series.length - 1].t - series[ddPeakIdx].t) / (30 * MS_PER_DAY);
}

/**
 * Fraction of rolling `years`-year windows where the fund's return is positive.
 * Used as a proxy for the spec's "Consistency Bonus" (beat category median).
 * A perfect substitute would require aligning all peer rolling windows by date,
 * which is O(N×K) and too expensive in the browser. This is a faithful proxy.
 */
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

/** Percentile of `v` within `arr` (0–100). `lowerIsBetter` inverts direction. */
function percentileOf(arr: number[], v: number, lowerIsBetter = false): number {
  if (arr.length <= 1) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter((x) => x < v).length;
  const equal = sorted.filter((x) => x === v).length;
  const p = ((below + equal * 0.5) / sorted.length) * 100;
  return lowerIsBetter ? 100 - p : p;
}

// ─── Public types ─────────────────────────────────────────────────────────────

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

  // Pillar 4 — Downside Protection
  maxDrawdown: number | null;    // value in (-1, 0]
  recoveryMonths: number | null;
  stdDev: number | null;         // annualized

  // Metadata
  historyYears: number;
  dataPoints: number;
}

export interface PillarScore {
  rawScore: number;         // 0-100 before applying pillar weight
  contribution: number;     // pillar's weighted contribution to final score
  nominalWeight: number;    // spec-defined weight %
  effectiveWeight: number;  // actual weight used (0 if unavailable)
  available: boolean;
  metricsUsed: number;
  metricsTotal: number;
}

export interface EngineScoreResult {
  fundScore: number;       // 0-100
  confidenceScore: number; // 0-100
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
  categoryRank?: number;
  totalInCategory?: number;
}

// ─── Step 1 — Compute raw metrics ────────────────────────────────────────────

export function computeEngineMetrics(series: NavPoint[]): EngineMetrics {
  const historyYears =
    series.length > 1
      ? (series[series.length - 1].t - series[0].t) / YEAR_MS
      : 0;

  const lRets = logReturns(series);
  const vol = annualisedStdDev(lRets);
  const ddVol = annualisedDownsideVol(lRets);

  // Use 3Y CAGR as primary return; fall back to 1Y if unavailable
  const r3y = trailingCAGR(series, 3) ?? trailingCAGR(series, 1);

  const sharpe =
    r3y != null && vol != null && vol > 0
      ? (r3y - RISK_FREE_RATE_ANNUAL) / vol
      : null;

  const sortino =
    r3y != null && ddVol != null && ddVol > 0
      ? (r3y - RISK_FREE_RATE_ANNUAL) / ddVol
      : null;

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

    maxDrawdown: maxDrawdown(series),
    recoveryMonths: recoveryMonths(series),
    stdDev: vol,

    historyYears,
    dataPoints: series.length,
  };
}

// ─── Confidence Score ─────────────────────────────────────────────────────────

export function computeConfidenceScore(m: EngineMetrics): number {
  // Fund age score (70% weight)
  const ageScore =
    m.historyYears >= 10 ? 100
    : m.historyYears >= 7 ? 90
    : m.historyYears >= 5 ? 75
    : m.historyYears >= 3 ? 60
    : 40;

  // Data completeness (30% weight)
  const keys: (keyof EngineMetrics)[] = [
    "cagr3y", "sharpe", "sortino", "maxDrawdown", "stdDev", "rollingPos3y",
  ];
  const avail = keys.filter((k) => m[k] != null).length;
  const completenessScore =
    avail / keys.length > 0.95 ? 100
    : avail / keys.length > 0.9 ? 80
    : avail / keys.length > 0.8 ? 60
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

// ─── Step 2-4 — Score with peer context ──────────────────────────────────────

export function scoreWithPeers(
  m: EngineMetrics,
  peers: EngineMetrics[],
): EngineScoreResult {
  // Helper: extract non-null values of a metric key across all peers
  const peerVals = <K extends keyof EngineMetrics>(key: K): number[] =>
    peers
      .map((p) => p[key] as number | null)
      .filter((v): v is number => v != null);

  // ── Pillar 1: Long-Term Consistency (23%) ────────────────────────────────
  // Internal weights per spec: 3Y(5) 5Y(6) 7Y(5) 10Y(4) Consistency(3) = 23
  const ltc = scorePillar(
    [
      { v: m.cagr3y,      w: 5, peers: peerVals("cagr3y") },
      { v: m.cagr5y,      w: 6, peers: peerVals("cagr5y") },
      { v: m.cagr7y,      w: 5, peers: peerVals("cagr7y") },
      { v: m.cagr10y,     w: 4, peers: peerVals("cagr10y") },
      { v: m.rollingPos3y,w: 3, peers: peerVals("rollingPos3y") },
    ],
    23,
  );

  // ── Pillar 2: Short-Term Performance (5%) ───────────────────────────────
  // Internal weights: 1M(1) 3M(2) 6M(2) = 5
  const stp = scorePillar(
    [
      { v: m.ret1m, w: 1, peers: peerVals("ret1m") },
      { v: m.ret3m, w: 2, peers: peerVals("ret3m") },
      { v: m.ret6m, w: 2, peers: peerVals("ret6m") },
    ],
    5,
  );

  // ── Pillar 3: Risk-Adjusted Performance (20%) ────────────────────────────
  // Sortino(10) Sharpe(6) IR(4 — unavailable, redistributed within pillar)
  const ra = scorePillar(
    [
      { v: m.sortino, w: 10, peers: peerVals("sortino") },
      { v: m.sharpe,  w: 6,  peers: peerVals("sharpe") },
      // IR omitted — weight redistributed locally via normalisation
    ],
    20,
  );

  // ── Pillar 4: Downside Protection & Risk (20%) ───────────────────────────
  // MaxDD(4) Recovery(3) StdDev(1) — captures/beta unavailable, redistributed
  const dp = scorePillar(
    [
      { v: m.maxDrawdown,    w: 4, peers: peerVals("maxDrawdown"),    lower: true },
      { v: m.recoveryMonths, w: 3, peers: peerVals("recoveryMonths"), lower: true },
      { v: m.stdDev,         w: 1, peers: peerVals("stdDev"),         lower: true },
    ],
    20,
  );

  // ── Pillars 5, 6, 7: Unavailable ────────────────────────────────────────
  const unavailable = (nominalWeight: number): PillarScore => ({
    rawScore: 0, contribution: 0, nominalWeight,
    effectiveWeight: 0, available: false, metricsUsed: 0, metricsTotal: 0,
  });

  const ce = unavailable(15);
  const pq = unavailable(12);
  const ma = unavailable(5);

  // ── Final score: normalize by available weight ───────────────────────────
  const pillars = [ltc, stp, ra, dp, ce, pq, ma];
  const totalEffW = pillars.reduce((s, p) => s + p.effectiveWeight, 0);

  let fundScore = 0;
  if (totalEffW > 0) {
    const weightedSum = pillars.reduce(
      (s, p) => s + p.rawScore * p.effectiveWeight,
      0,
    );
    fundScore = Math.max(0, Math.min(100, Math.round(weightedSum / totalEffW)));
  }

  const conf = computeConfidenceScore(m);
  const { rating, color: ratingColor } = getRating(fundScore);

  return {
    fundScore,
    confidenceScore: conf,
    rating,
    ratingColor,
    pillars: {
      longTermConsistency: ltc,
      shortTermPerformance: stp,
      riskAdjusted: ra,
      downsideProtection: dp,
      costEfficiency: ce,
      portfolioQuality: pq,
      managementAUM: ma,
    },
  };
}

// ─── Internal pillar scorer ───────────────────────────────────────────────────

interface MetricInput {
  v: number | null;
  w: number;        // spec-defined internal weight
  peers: number[];
  lower?: boolean;  // true = lower value is better
}

function scorePillar(metrics: MetricInput[], nominalWeight: number): PillarScore {
  let availW = 0, scoreSum = 0, metricsUsed = 0;

  for (const { v, w, peers, lower } of metrics) {
    if (v == null || peers.length <= 1) continue; // unavailable — redistribute
    const pct = percentileOf(peers, v, lower);
    scoreSum += pct * w;
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

  // Rescale within-pillar (local redistribution of missing metric weights)
  const rawScore = scoreSum / availW; // 0-100

  return {
    rawScore,
    contribution: rawScore * nominalWeight,
    nominalWeight,
    effectiveWeight: nominalWeight,
    available: true,
    metricsUsed,
    metricsTotal: metrics.length,
  };
}

// ─── Derive strengths / weaknesses ───────────────────────────────────────────

interface PillarEntry {
  name: string;
  pillar: PillarScore;
}

export function getStrengthsWeaknesses(pillars: EngineScoreResult["pillars"]): {
  strengths: string[];
  weaknesses: string[];
} {
  const entries: PillarEntry[] = [
    { name: "Long-Term Consistency", pillar: pillars.longTermConsistency },
    { name: "Short-Term Performance", pillar: pillars.shortTermPerformance },
    { name: "Risk-Adjusted Returns", pillar: pillars.riskAdjusted },
    { name: "Downside Protection", pillar: pillars.downsideProtection },
  ].filter((e) => e.pillar.available);

  entries.sort((a, b) => b.pillar.rawScore - a.pillar.rawScore);

  return {
    strengths: entries.slice(0, 2).filter(e => e.pillar.rawScore >= 60).map(e => e.name),
    weaknesses: entries.slice(-2).filter(e => e.pillar.rawScore < 50).map(e => e.name),
  };
}
