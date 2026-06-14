/**
 * explore-metrics.ts
 *
 * Explore Score  — 7-component ratio score (0–100), category-relative.
 * Return Score   — short/long-term return percentile composite (0–100).
 *
 * ST (30%): 1D(20%) + 1W(20%) + 1M(20%) + 3M(20%) + 6M(20%)
 * LT (70%): Rolling 1Y(25%) + Rolling 3Y(25%) + Rolling 5Y(25%) + Rolling 7Y(25%)
 */

import type { EngineMetrics } from "./scoring-engine";
import { percentileOf } from "./fund-metrics";

// ─── Percentile helper ────────────────────────────────────────────────────────

function pctile(
  v: number | null,
  all: (number | null)[],
  lowerBetter = false,
): number | null {
  if (v == null) return null;
  const valid = all.filter((x): x is number => x != null);
  if (valid.length <= 1) return null;
  return percentileOf(valid, v, lowerBetter);
}

// ─── Risk-Adjusted Return ─────────────────────────────────────────────────────

export function computeRiskAdjReturn(m: EngineMetrics): number | null {
  if (m.annualReturnAvg == null || m.stdDev == null || m.stdDev <= 0) return null;
  return m.annualReturnAvg / m.stdDev;
}

// ─── Explore Score ────────────────────────────────────────────────────────────
//
// Weights:
//   Sharpe Ratio          20%
//   Sortino Ratio         15%
//   Jensen's Alpha        15%
//   Information Ratio     15%
//   Risk-Adjusted Return  15%
//   Upside Capture        10%
//   Downside Capture      10% (lower is better)

export function computeExploreScore(
  m: EngineMetrics,
  peers: EngineMetrics[],
): number | null {
  const riskAdj = computeRiskAdjReturn(m);
  const peerRiskAdj = peers.map(p => computeRiskAdjReturn(p));

  const components: {
    v: number | null;
    peers: (number | null)[];
    w: number;
    lower?: boolean;
  }[] = [
    { v: m.sharpe,           peers: peers.map(p => p.sharpe),           w: 0.20 },
    { v: m.sortino,          peers: peers.map(p => p.sortino),          w: 0.15 },
    { v: m.jensensAlpha,     peers: peers.map(p => p.jensensAlpha),     w: 0.15 },
    { v: m.informationRatio, peers: peers.map(p => p.informationRatio), w: 0.15 },
    { v: riskAdj,            peers: peerRiskAdj,                        w: 0.15 },
    { v: m.upsideCapture,    peers: peers.map(p => p.upsideCapture),    w: 0.10 },
    { v: m.downsideCapture,  peers: peers.map(p => p.downsideCapture),  w: 0.10, lower: true },
  ];

  let totalW = 0;
  let score = 0;
  for (const c of components) {
    const p = pctile(c.v, c.peers, c.lower);
    if (p == null) continue;
    score += p * c.w;
    totalW += c.w;
  }

  if (totalW < 0.20) return null;
  return Math.round(score / totalW);
}

// ─── Return Score ─────────────────────────────────────────────────────────────
//
// Short-Term (weight = 30%):
//   1D  20%,  1W  20%,  1M  20%,  3M  20%,  6M  20%
//
// Long-Term (weight = 70%):
//   Rolling 1Y  25%,  Rolling 3Y  25%,  Rolling 5Y  25%,  Rolling 7Y  25%
//
// All periods percentile-ranked within peer group before weighting.

export interface ReturnScoreBreakdown {
  shortTermScore: number | null;
  longTermScore:  number | null;
  returnScore:    number | null;
}

export function computeReturnScore(
  m: EngineMetrics,
  peers: EngineMetrics[],
): ReturnScoreBreakdown {
  const stComps: { v: number | null; all: (number | null)[]; w: number }[] = [
    { v: m.ret1d, all: peers.map(p => p.ret1d), w: 0.20 },
    { v: m.ret1w, all: peers.map(p => p.ret1w), w: 0.20 },
    { v: m.ret1m, all: peers.map(p => p.ret1m), w: 0.20 },
    { v: m.ret3m, all: peers.map(p => p.ret3m), w: 0.20 },
    { v: m.ret6m, all: peers.map(p => p.ret6m), w: 0.20 },
  ];

  let stScore = 0, stW = 0;
  for (const c of stComps) {
    const p = pctile(c.v, c.all);
    if (p == null) continue;
    stScore += p * c.w;
    stW += c.w;
  }
  const shortTermScore = stW > 0 ? Math.round(stScore / stW) : null;

  const ltComps: { v: number | null; all: (number | null)[]; w: number }[] = [
    { v: m.rollingReturn1yAvg, all: peers.map(p => p.rollingReturn1yAvg), w: 0.25 },
    { v: m.rollingReturn3yAvg, all: peers.map(p => p.rollingReturn3yAvg), w: 0.25 },
    { v: m.rollingReturn5yAvg, all: peers.map(p => p.rollingReturn5yAvg), w: 0.25 },
    { v: m.rollingReturn7yAvg, all: peers.map(p => p.rollingReturn7yAvg), w: 0.25 },
  ];

  let ltScore = 0, ltW = 0;
  for (const c of ltComps) {
    const p = pctile(c.v, c.all);
    if (p == null) continue;
    ltScore += p * c.w;
    ltW += c.w;
  }
  const longTermScore = ltW > 0 ? Math.round(ltScore / ltW) : null;

  let returnScore: number | null = null;
  if (shortTermScore != null || longTermScore != null) {
    const stF  = shortTermScore ?? 0;
    const ltF  = longTermScore ?? 0;
    const stWf = shortTermScore != null ? 0.30 : 0;
    const ltWf = longTermScore  != null ? 0.70 : 0;
    const total = stWf + ltWf;
    returnScore = total > 0 ? Math.round((stF * stWf + ltF * ltWf) / total) : null;
  }

  return { shortTermScore, longTermScore, returnScore };
}

// ─── Ranking Score ─────────────────────────────────────────────────────────────
//
// Rankings page composite — combines the three scoring dimensions:
//   Engine Score (7-pillar fundamental quality)   50%
//   Return Score  (trailing returns ST + LT)       30%
//   Explore Score (ratio-based quality metrics)    20%

export function computeRankingScore(
  engineFinalScore: number | null,
  returnScore:      number | null,
  exploreScore:     number | null,
): number | null {
  const ENGINE_W  = 0.50;
  const RETURN_W  = 0.30;
  const EXPLORE_W = 0.20;

  let score  = 0;
  let totalW = 0;

  if (engineFinalScore != null) { score += engineFinalScore * ENGINE_W;  totalW += ENGINE_W; }
  if (returnScore      != null) { score += returnScore      * RETURN_W;  totalW += RETURN_W; }
  if (exploreScore     != null) { score += exploreScore     * EXPLORE_W; totalW += EXPLORE_W; }

  if (totalW < ENGINE_W) return null;
  return Math.round(score / totalW);
}
