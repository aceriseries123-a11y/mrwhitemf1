/**
 * explore-metrics.ts — v2
 *
 * Explore Score uses the same philosophy as the Fund Score (dashboard):
 *   - Every component is percentile-ranked within the same category peer set
 *   - Fixed weights, no dynamic redistribution
 *   - Penalties applied after weighted score
 *
 * Explore Score components (fixed weights, total 100%):
 *   Sharpe Ratio          20%   higher = better
 *   Sortino Ratio         20%   higher = better
 *   Information Ratio     20%   higher = better (consistency of alpha)
 *   Jensen's Alpha        15%   higher = better
 *   Risk-Adjusted Return  15%   higher = better (return/stddev)
 *   Upside Capture        10%   higher = better (captured more rally)
 *   Downside Capture       —    (penalty only — see EXPLORE_PENALTY_RULES)
 *
 * Penalties (applied after weighted score):
 *   Downside Capture > peer top 10% (worst capturers): −5 pts
 *   Sharpe < peer bottom 10%: −5 pts
 *
 * Return Score — short/long-term return percentile composite (0–100):
 *   ST (30%): 1D 20% + 1W 20% + 1M 20% + 3M 20% + 6M 20%
 *   LT (70%): Rolling 1Y 25% + Rolling 3Y 25% + Rolling 5Y 25% + Rolling 7Y 25%
 *
 * Ranking Score composite:
 *   Fund Score 50% + Return Score 30% + Explore Score 20%
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

// ─── Explore Penalty Rules ────────────────────────────────────────────────────

export interface ExplorePenaltyRule {
  label: string;
  points: number;
  test: (m: EngineMetrics, peers: EngineMetrics[]) => boolean;
}

export const EXPLORE_PENALTY_RULES: ExplorePenaltyRule[] = [
  {
    label: "Bottom 10% Downside Capture",
    points: 5,
    test: (m, peers) => {
      if (m.downsideCapture == null) return false;
      const valid = peers.map(p => p.downsideCapture).filter((x): x is number => x != null);
      if (valid.length <= 1) return false;
      // Higher downside capture = worse; "bottom 10%" means worst 10% (highest values)
      return percentileOf(valid, m.downsideCapture, true) < 10;
    },
  },
  {
    label: "Bottom 10% Sharpe Ratio",
    points: 5,
    test: (m, peers) => {
      if (m.sharpe == null) return false;
      const valid = peers.map(p => p.sharpe).filter((x): x is number => x != null);
      if (valid.length <= 1) return false;
      return percentileOf(valid, m.sharpe, false) < 10;
    },
  },
];

// ─── Explore Score ────────────────────────────────────────────────────────────
//
// Fixed weights — same philosophy as Fund Score (dashboard):
//   Sharpe Ratio          20%
//   Sortino Ratio         20%
//   Information Ratio     20%
//   Jensen's Alpha        15%
//   Risk-Adjusted Return  15%
//   Upside Capture        10%
//   (Downside Capture handled via penalty only)

export interface ExploreScoreResult {
  score: number | null;
  preScore: number | null;
  penalties: { label: string; points: number }[];
}

export function computeExploreScore(
  m: EngineMetrics,
  peers: EngineMetrics[],
): number | null {
  return computeExploreScoreDetailed(m, peers).score;
}

export function computeExploreScoreDetailed(
  m: EngineMetrics,
  peers: EngineMetrics[],
): ExploreScoreResult {
  const riskAdj = computeRiskAdjReturn(m);
  const peerRiskAdj = peers.map(p => computeRiskAdjReturn(p));

  const W = {
    sharpe: 0.20,
    sortino: 0.20,
    infoRatio: 0.20,
    alpha: 0.15,
    riskAdj: 0.15,
    upsideCapture: 0.10,
  };

  const components: { p: number | null; w: number }[] = [
    { p: pctile(m.sharpe,           peers.map(p => p.sharpe)),           w: W.sharpe },
    { p: pctile(m.sortino,          peers.map(p => p.sortino)),          w: W.sortino },
    { p: pctile(m.informationRatio, peers.map(p => p.informationRatio)), w: W.infoRatio },
    { p: pctile(m.jensensAlpha,     peers.map(p => p.jensensAlpha)),     w: W.alpha },
    { p: pctile(riskAdj,            peerRiskAdj),                        w: W.riskAdj },
    { p: pctile(m.upsideCapture,    peers.map(p => p.upsideCapture)),    w: W.upsideCapture },
  ];

  // Fixed weights — neutral 50 fallback for any null component (consistent with Fund Score)
  const preScore =
    (components[0].p ?? 50) * W.sharpe +
    (components[1].p ?? 50) * W.sortino +
    (components[2].p ?? 50) * W.infoRatio +
    (components[3].p ?? 50) * W.alpha +
    (components[4].p ?? 50) * W.riskAdj +
    (components[5].p ?? 50) * W.upsideCapture;

  // Need at least one real data point to produce a score
  const hasAny = components.some(c => c.p != null);
  if (!hasAny) return { score: null, preScore: null, penalties: [] };

  // Penalties
  const penalties = EXPLORE_PENALTY_RULES
    .filter(r => r.test(m, peers))
    .map(r => ({ label: r.label, points: r.points }));
  const totalPenalty = penalties.reduce((s, p) => s + p.points, 0);

  const score = Math.round(Math.max(0, Math.min(100, preScore - totalPenalty)));
  return { score, preScore, penalties };
}

// ─── Return Score ─────────────────────────────────────────────────────────────
//
// Short-Term (weight = 30%):
//   1D 20%, 1W 20%, 1M 20%, 3M 20%, 6M 20%
//
// Long-Term (weight = 70%):
//   Rolling 1Y 25%, Rolling 3Y 25%, Rolling 5Y 25%, Rolling 7Y 25%
//
// All periods percentile-ranked within peer group before weighting.
// Fixed weights — neutral 50 if a period is null.

export interface ReturnScoreBreakdown {
  shortTermScore: number | null;
  longTermScore:  number | null;
  returnScore:    number | null;
}

export function computeReturnScore(
  m: EngineMetrics,
  peers: EngineMetrics[],
): ReturnScoreBreakdown {
  const stComps = [
    { v: m.ret1d, all: peers.map(p => p.ret1d) },
    { v: m.ret1w, all: peers.map(p => p.ret1w) },
    { v: m.ret1m, all: peers.map(p => p.ret1m) },
    { v: m.ret3m, all: peers.map(p => p.ret3m) },
    { v: m.ret6m, all: peers.map(p => p.ret6m) },
  ];

  const stScores = stComps.map(c => pctile(c.v, c.all));
  const stHasAny = stScores.some(s => s != null);
  const stScore = stHasAny
    ? (stScores[0] ?? 50) * 0.20 + (stScores[1] ?? 50) * 0.20 +
      (stScores[2] ?? 50) * 0.20 + (stScores[3] ?? 50) * 0.20 + (stScores[4] ?? 50) * 0.20
    : null;
  const shortTermScore = stScore != null ? Math.round(stScore) : null;

  const ltComps = [
    { v: m.rollingReturn1yAvg, all: peers.map(p => p.rollingReturn1yAvg) },
    { v: m.rollingReturn3yAvg, all: peers.map(p => p.rollingReturn3yAvg) },
    { v: m.rollingReturn5yAvg, all: peers.map(p => p.rollingReturn5yAvg) },
    { v: m.rollingReturn7yAvg, all: peers.map(p => p.rollingReturn7yAvg) },
  ];

  const ltScores = ltComps.map(c => pctile(c.v, c.all));
  const ltHasAny = ltScores.some(s => s != null);
  const ltScore = ltHasAny
    ? (ltScores[0] ?? 50) * 0.25 + (ltScores[1] ?? 50) * 0.25 +
      (ltScores[2] ?? 50) * 0.25 + (ltScores[3] ?? 50) * 0.25
    : null;
  const longTermScore = ltScore != null ? Math.round(ltScore) : null;

  let returnScore: number | null = null;
  if (shortTermScore != null || longTermScore != null) {
    const st = shortTermScore ?? 50;
    const lt = longTermScore ?? 50;
    returnScore = Math.round(st * 0.30 + lt * 0.70);
  }

  return { shortTermScore, longTermScore, returnScore };
}

// ─── Ranking Score ─────────────────────────────────────────────────────────────
//
// Fund Score (fundamental quality)   50%
// Return Score  (rolling returns)    30%
// Explore Score (ratio-based)        20%
//
// All fixed weights — no redistribution.
// If Fund Score is null, Ranking Score is null (Fund Score is mandatory).

export function computeRankingScore(
  fundScore:    number | null,
  returnScore:  number | null,
  exploreScore: number | null,
): number | null {
  if (fundScore == null) return null;
  const rs = returnScore  ?? 50;
  const es = exploreScore ?? 50;
  return Math.round(fundScore * 0.50 + rs * 0.30 + es * 0.20);
}
