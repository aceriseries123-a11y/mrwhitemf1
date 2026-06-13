/**
 * dashboard.tsx
 *
 * Two independent ranking tables:
 *
 * TABLE 1 — Overall Top 10 (cross-category)
 *   Uses a 6-factor Advanced Score with percentile normalisation across a
 *   48-fund pool (6 Direct-Growth schemes × 8 major categories). Each factor
 *   is ranked within the pool before weighting, making the score valid for
 *   cross-category comparison.
 *   Factors: Sharpe 28% · Sortino 22% · Calmar 20% · CAGR3Y 15% · Rolling+ 10% · MaxDD 5%
 *
 * TABLE 2 — Category Top 10
 *   Uses the existing within-category QuantFund Score (CAGR 35% · Sharpe 25%
 *   · MaxDD 20% · Rolling+ 20%). Category switchable via pills.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, TrendingUp, Layers, CheckCircle2,
  Star, BarChart2, Activity, Medal,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import { classifyAMFICategory, type QuantFundCategory } from "../lib/categories";
import { fetchNavHistory } from "../lib/nav-history";
import {
  computeFundMetrics, quantFundScore, calmarRatio,
  advancedPoolScore, type FundMetrics, type PoolFundData,
} from "../lib/fund-metrics";
import { fmtPct, fmtNum } from "../lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      { name: "description", content: "Advanced cross-category fund rankings with a 6-factor percentile-normalised score plus per-category top 10 leaderboards." },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Advanced quant rankings computed from real NAV history." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

// ─── Pool config ──────────────────────────────────────────────────────────────
// 8 categories × 6 funds = 48 NAV history fetches for the overall pool.
// Queries are shared with the React Query cache so revisiting is instant.

const OVERALL_POOL_CONFIG: { category: QuantFundCategory; count: number }[] = [
  { category: "Large Cap",         count: 6 },
  { category: "Mid Cap",           count: 6 },
  { category: "Small Cap",         count: 6 },
  { category: "Flexi Cap",         count: 6 },
  { category: "ELSS",              count: 6 },
  { category: "Aggressive Hybrid", count: 6 },
  { category: "Balanced Advantage",count: 6 },
  { category: "Short Duration",    count: 6 },
];

// Category pills for table 2
const CAT_TABS: QuantFundCategory[] = [
  "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap",
  "Multi Cap", "ELSS", "Aggressive Hybrid", "Balanced Advantage",
  "Short Duration", "Corporate Bond", "Gilt",
];

const TOP_N = 10;
const CAT_POOL = 25; // candidates per category for table 2

// ─── Types ────────────────────────────────────────────────────────────────────

type PoolEntry = AMFIScheme & { poolCategory: QuantFundCategory };

interface ScoredOverall extends PoolFundData {
  scheme: PoolEntry;
  advScore: number | null;
  rank?: number;
}

type CatRow = AMFIScheme & {
  score: number | null;
  ret1y: number | null;
  cagr3y: number | null;
  sharpe: number | null;
  maxDD: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-30 hidden w-72 rounded-xl border border-border bg-surface p-3 text-[10px] normal-case leading-relaxed tracking-normal text-foreground shadow-2xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function ScoreBar({ value, max = 100, color = "bg-cyan" }: { value: number | null; max?: number; color?: string }) {
  return (
    <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-border">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: value != null ? `${Math.min(100, (value / max) * 100)}%` : "0%" }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeCategory, setActiveCategory] = useState<QuantFundCategory>("Large Cap");

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  // ── Overall pool (48 funds across 8 categories) ───────────────────────────

  const overallCandidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];
    return OVERALL_POOL_CONFIG.flatMap(({ category, count }) => {
      const inCat = activeSchemes.filter(
        (s) => classifyAMFICategory(s.category) === category,
      );
      const direct = inCat.filter(
        (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
      );
      const pool = direct.length >= 4 ? direct : inCat;
      return pool.slice(0, count).map((s) => ({ ...s, poolCategory: category }));
    });
  }, [activeSchemes]);

  const overallNavQ = useQueries({
    queries: overallCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const overallLoaded = overallNavQ.filter((q) => q.data).length;
  const overallTotal  = overallNavQ.length;
  const overallReady  = overallLoaded === overallTotal && overallTotal > 0;

  /** Progressively ranked as NAV data arrives — re-ranked on every completion. */
  const overallRanked = useMemo((): ScoredOverall[] => {
    const pool: ScoredOverall[] = [];

    overallCandidates.forEach((s, i) => {
      const history = overallNavQ[i]?.data;
      if (!history) return;
      const metrics = computeFundMetrics(history.series);
      pool.push({ scheme: s, metrics, calmar: calmarRatio(metrics), advScore: null });
    });

    if (pool.length < 3) return [];

    // Percentile-normalise across the full loaded pool, then score
    const scored = pool.map((f) => ({ ...f, advScore: advancedPoolScore(f, pool) }));
    scored.sort((a, b) => (b.advScore ?? -1) - (a.advScore ?? -1));

    return scored.slice(0, TOP_N).map((f, i) => ({ ...f, rank: i + 1 }));
  }, [overallCandidates, overallNavQ]);

  // ── Category pool (25 funds for selected category) ────────────────────────

  const catCandidates = useMemo((): AMFIScheme[] => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    const direct = inCat.filter(
      (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
    );
    const pool = direct.length >= 10 ? direct : inCat;
    return pool.slice(0, CAT_POOL);
  }, [activeSchemes, activeCategory]);

  const catNavQ = useQueries({
    queries: catCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const catLoaded = catNavQ.filter((q) => q.data).length;
  const catTotal  = catNavQ.length;
  const catReady  = catLoaded === catTotal && catTotal > 0;

  const catRanked = useMemo((): CatRow[] => {
    const rows: CatRow[] = catCandidates.map((s, i) => {
      const history = catNavQ[i]?.data;
      if (!history) return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null };
      const m = computeFundMetrics(history.series);
      return { ...s, score: quantFundScore(m), ret1y: m.ret1y, cagr3y: m.cagr3y, sharpe: m.sharpe, maxDD: m.maxDrawdown };
    });
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return rows.slice(0, TOP_N);
  }, [catCandidates, catNavQ]);

  // ── KPI strip ─────────────────────────────────────────────────────────────

  const topAdvScore = overallRanked[0]?.advScore ?? null;
  const topCatScore = catRanked[0]?.score ?? null;
  const universeSize = activeSchemes.length;
  const asOf = allSchemes?.[0]?.date ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <AppShell title="Dashboard">
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">
              Fund data unavailable
            </p>
            <p className="font-mono text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Dashboard">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI universe…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {universeSize.toLocaleString()} active schemes · Top 10 overall + per-category rankings
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="NAV data updates once daily after market close." />
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={Layers}      label="Universe"     value={universeSize.toLocaleString()} />
          <KpiTile icon={Activity}    label="Pool loaded"  value={`${overallLoaded}/${overallTotal}`}
            suffix={overallReady ? "ready" : "loading"}
            tone={overallReady ? "positive" : undefined} />
          <KpiTile icon={Star}        label="Top adv. score"
            value={topAdvScore != null ? fmtNum(topAdvScore, 1) : "—"} tone="cyan" />
          <KpiTile icon={TrendingUp}  label="Top cat. score"
            value={topCatScore != null ? fmtNum(topCatScore, 1) : "—"} tone="cyan" />
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TABLE 1 — Overall Top 10 (Advanced cross-category score)          */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <section>
          {/* Section label */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Overall Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                Advanced Score
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cross-category ranking using 6 risk-adjusted factors, each percentile-ranked within the
              48-fund pool (8 categories · 6 Direct-Growth schemes each).
              <InfoTip text="Advanced Score = Sharpe (28%) + Sortino (22%) + Calmar = CAGR/|MaxDD| (20%) + 3Y CAGR (15%) + Rolling Positive % (10%) + Max Drawdown (5%). Every factor is percentile-ranked within the 48-fund pool before weighting — a debt fund with excellent risk-adjusted returns can outscore an equity fund with higher but volatile returns." />
            </p>
          </div>

          {/* Score factor strip */}
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { label: "Sharpe Ratio",  pct: "28%", note: "Return / volatility" },
              { label: "Sortino Ratio", pct: "22%", note: "Return / downside vol" },
              { label: "Calmar Ratio",  pct: "20%", note: "CAGR3Y / |Max DD|" },
              { label: "3Y CAGR",       pct: "15%", note: "Compounded return" },
              { label: "Rolling 1Y+",   pct: "10%", note: "% positive 1Y windows" },
              { label: "Max Drawdown",  pct: "5%",  note: "Lower is better" },
            ].map((f) => (
              <div key={f.label}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px]">
                <span className="font-mono font-bold text-cyan">{f.pct}</span>
                <span className="text-muted-foreground">{f.label}</span>
                <span className="hidden text-muted-foreground/60 sm:block">· {f.note}</span>
              </div>
            ))}
          </div>

          {/* Loading progress for overall pool */}
          {!overallReady && overallTotal > 0 && (
            <div className="mb-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-cyan" />
                  Scoring cross-category pool — {overallLoaded}/{overallTotal} loaded
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round((overallLoaded / overallTotal) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-cyan transition-all duration-300"
                  style={{ width: `${(overallLoaded / overallTotal) * 100}%` }} />
              </div>
              {overallRanked.length > 0 && (
                <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Showing partial results from {overallLoaded} loaded funds — will update as more load
                </p>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {overallRanked.length === 0 && overallLoaded < 3 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Loading cross-category pool…
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 text-right font-medium">
                        Adv. Score
                        <InfoTip text="0–100 · percentile-normalised across 48-fund cross-category pool. Scores are relative, not absolute." />
                      </th>
                      <th className="p-3 text-right font-medium">Sharpe</th>
                      <th className="p-3 text-right font-medium">Sortino</th>
                      <th className="p-3 text-right font-medium">Calmar</th>
                      <th className="p-3 text-right font-medium">3Y CAGR</th>
                      <th className="p-3 text-right font-medium">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overallRanked.map((f, idx) => {
                      const isTop3 = idx < 3;
                      const m = f.metrics;
                      return (
                        <tr key={f.scheme.schemeCode}
                          className={`group transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.02]" : ""}`}>

                          {/* Rank */}
                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          {/* Scheme name */}
                          <td className="p-3">
                            <Link to="/fund/$id" params={{ id: f.scheme.schemeCode }}
                              className="block max-w-[260px] text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                              {f.scheme.schemeName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.amc} · #{f.scheme.schemeCode}
                            </p>
                          </td>

                          {/* Category badge */}
                          <td className="p-3">
                            <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.poolCategory}
                            </span>
                          </td>

                          {/* Advanced Score */}
                          <td className="p-3 text-right">
                            {f.advScore != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">
                                  {fmtNum(f.advScore, 1)}
                                </span>
                                <ScoreBar value={f.advScore} />
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Sharpe */}
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sharpe)}`}>
                            {fmtNum(m.sharpe, 2)}
                          </td>

                          {/* Sortino */}
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sortino)}`}>
                            {fmtNum(m.sortino, 2)}
                          </td>

                          {/* Calmar */}
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(f.calmar)}`}>
                            {fmtNum(f.calmar, 2)}
                          </td>

                          {/* 3Y CAGR */}
                          <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.cagr3y)}`}>
                            {fmtPct(m.cagr3y, { signed: true })}
                          </td>

                          {/* Max DD */}
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.maxDrawdown)}`}>
                            {fmtPct(m.maxDrawdown, { signed: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table footer */}
            <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Pool: {OVERALL_POOL_CONFIG.length} categories · {overallTotal} candidates · top {TOP_N} shown
              </span>
              {overallReady ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-positive">
                  <CheckCircle2 className="h-3 w-3" /> All {overallLoaded} scored
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {overallLoaded}/{overallTotal} loaded
                </span>
              )}
            </div>
          </div>

          {/* Methodology note */}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Advanced Score</span> is percentile-based and relative to this 48-fund pool —
            a score of 85 means the fund outperforms ~85% of the pool on that weighted composite.
            Scores will shift as more funds load. Cross-category comparison using raw returns is invalid;
            this score uses risk-adjusted ratios (Sharpe, Sortino, Calmar) that are category-neutral.
          </p>
        </section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TABLE 2 — Category Top 10 (QuantFund Score within category)       */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <section>
          {/* Section label */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Category Top 10</h2>
              <span className="rounded-lg border border-border bg-surface px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                QF Score
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Within-category ranking using QuantFund Score — CAGR3Y (35%) · Sharpe (25%) · Max Drawdown (20%) · Rolling Positive % (20%).
              Scores are only valid within the same category.
            </p>
          </div>

          {/* Category pills */}
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-0.5">
            {CAT_TABS.map((cat) => {
              const count = activeSchemes.filter((s) => classifyAMFICategory(s.category) === cat).length;
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-150 ${
                    cat === activeCategory
                      ? "bg-cyan text-background shadow-[0_0_14px_rgba(34,211,238,0.3)]"
                      : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                  }`}>
                  {cat}
                  <span className="ml-1.5 opacity-50">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
                {activeCategory} · Top {TOP_N}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {catReady ? (
                  <><CheckCircle2 className="h-3 w-3 text-positive" /> {catLoaded} scored</>
                ) : (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Scoring {catLoaded}/{catTotal}</>
                )}
              </span>
            </div>

            {catCandidates.length === 0 ? (
              <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                No schemes found in {activeCategory}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 text-right font-medium">
                        QF Score
                        <InfoTip text="QuantFund Score = CAGR3Y (35%) + Sharpe (25%) + Max Drawdown (20%) + Rolling 1Y Positive % (20%). Only comparable within the same category." />
                      </th>
                      <th className="p-3 text-right font-medium">1Y Ret</th>
                      <th className="p-3 text-right font-medium">3Y CAGR</th>
                      <th className="p-3 text-right font-medium">Sharpe</th>
                      <th className="p-3 text-right font-medium">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {catRanked.map((s, idx) => {
                      const isTop3 = idx < 3;
                      return (
                        <tr key={s.schemeCode}
                          className={`group transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.02]" : ""}`}>

                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link to="/fund/$id" params={{ id: s.schemeCode }}
                              className="block max-w-[300px] text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                              {s.schemeName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {s.amc} · #{s.schemeCode} · NAV ₹{s.nav.toFixed(2)}
                            </p>
                          </td>

                          <td className="p-3 text-right">
                            {s.score != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">
                                  {fmtNum(s.score, 1)}
                                </span>
                                <ScoreBar value={s.score} />
                              </div>
                            ) : catNavQ[idx]?.isLoading ? (
                              <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(s.ret1y)}`}>
                            {fmtPct(s.ret1y, { signed: true })}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.cagr3y)}`}>
                            {fmtPct(s.cagr3y, { signed: true })}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.sharpe)}`}>
                            {fmtNum(s.sharpe, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.maxDD)}`}>
                            {fmtPct(s.maxDD, { signed: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Top {CAT_POOL} Direct-Growth schemes loaded · top {TOP_N} shown
              </span>
              <Link to="/rankings"
                className="font-mono text-[9px] uppercase tracking-wider text-cyan transition-colors hover:text-cyan/80">
                Full rankings →
              </Link>
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">QuantFund Score</span> is a within-category composite and not
            valid for cross-category comparison. Use the <span className="text-foreground">Overall Top 10</span> table
            above for cross-category rankings. Data:{" "}
            <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI India</a>
            {" "}&{" "}
            <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          </p>
        </section>

      </div>
    </AppShell>
  );
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, suffix, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  suffix?: string;
  tone?: "positive" | "negative" | "cyan";
}) {
  const valueClass =
    tone === "positive" ? "text-positive" :
    tone === "negative" ? "text-negative" :
    tone === "cyan"     ? "text-cyan"     : "text-foreground";
  const iconClass =
    tone === "positive" ? "text-positive" :
    tone === "negative" ? "text-negative" :
    tone === "cyan"     ? "text-cyan"     : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-elevated">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 opacity-70 ${iconClass}`} />
      </div>
      <p className={`font-display text-xl font-bold tabular-nums ${valueClass}`}>
        {value}
        {suffix && (
          <span className="ml-1.5 font-mono text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}
