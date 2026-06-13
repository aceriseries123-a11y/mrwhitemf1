/**
 * dashboard.tsx
 *
 * TABLE 1 — Overall Top 10 (Advanced cross-category score)
 *   Pool: ALL Direct-Growth schemes across 14 major categories.
 *   Each fund is percentile-ranked on 6 risk-adjusted factors before weighting,
 *   so debt and hybrid funds compete on equal footing with equity.
 *   Factors: Sharpe 28% · Sortino 22% · Calmar 20% · CAGR3Y 15% · Rolling+ 10% · MaxDD 5%
 *
 * TABLE 2 — Category Top 10 (QuantFund Score within category)
 *   Pool: ALL Direct-Growth schemes in the selected category.
 *   No count cap. Rankings update progressively as NAV data loads.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, TrendingUp, Layers,
  CheckCircle2, Star, BarChart2, Activity, Medal,
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
      {
        name: "description",
        content:
          "Advanced cross-category fund rankings with a 6-factor percentile-normalised score plus per-category top-10 leaderboards using all AMFI schemes.",
      },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Full-universe quant rankings computed from real NAV history." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

// ─── Pool config ──────────────────────────────────────────────────────────────
// All Direct-Growth schemes from these categories feed the overall ranking pool.
// No per-category count cap — every eligible scheme participates.
// Safety cap: 500 total parallel NAV fetches (browser connection queue handles it).

const OVERALL_POOL_CATEGORIES: QuantFundCategory[] = [
  // Equity
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "Multi Cap",
  "Large & Mid Cap",
  "ELSS",
  "Focused",
  // Hybrid
  "Aggressive Hybrid",
  "Balanced Advantage",
  "Conservative Hybrid",
  // Debt
  "Short Duration",
  "Corporate Bond",
  "Banking & PSU",
  "Gilt",
];

const OVERALL_MAX = 500; // safety cap on total NAV fetches

// Category pills for table 2 — all major categories
const CAT_TABS: QuantFundCategory[] = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "Multi Cap",
  "Large & Mid Cap",
  "ELSS",
  "Focused",
  "Sectoral / Thematic",
  "Aggressive Hybrid",
  "Balanced Advantage",
  "Conservative Hybrid",
  "Multi Asset",
  "Liquid",
  "Ultra Short Duration",
  "Low Duration",
  "Short Duration",
  "Medium Duration",
  "Corporate Bond",
  "Banking & PSU",
  "Gilt",
  "Dynamic Bond",
  "Credit Risk",
  "Index Fund",
  "International / FoF",
  "Gold",
];

const TOP_N = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

type PoolEntry = AMFIScheme & { poolCategory: QuantFundCategory };

interface ScoredOverall extends PoolFundData {
  scheme: PoolEntry;
  advScore: number | null;
}

interface CatRow extends AMFIScheme {
  score: number | null;
  ret1y: number | null;
  cagr3y: number | null;
  sharpe: number | null;
  maxDD: number | null;
}

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

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-cyan transition-all duration-500"
        style={{ width: value != null ? `${Math.min(100, value)}%` : "0%" }}
      />
    </div>
  );
}

function ProgressBar({ loaded, total, label }: { loaded: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const done = loaded === total && total > 0;
  return (
    <div className="mb-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {done ? (
            <CheckCircle2 className="h-3 w-3 text-positive" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin text-cyan" />
          )}
          {label} — {loaded}/{total} loaded
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-positive" : "bg-cyan"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!done && loaded > 0 && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Ranking updates as each fund loads — final order may shift
        </p>
      )}
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

  // ── Overall pool — ALL Direct-Growth from 15 major categories ─────────────

  const overallCandidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];
    const all: PoolEntry[] = OVERALL_POOL_CATEGORIES.flatMap((category) => {
      const inCat = activeSchemes.filter(
        (s) => classifyAMFICategory(s.category) === category,
      );
      // Prefer Direct-Growth; fall back to all if fewer than 5 direct schemes
      const direct = inCat.filter(
        (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
      );
      const pool = direct.length >= 5 ? direct : inCat;
      return pool.map((s) => ({ ...s, poolCategory: category }));
    });
    return all.slice(0, OVERALL_MAX);
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
  const overallDone   = overallLoaded === overallTotal && overallTotal > 0;

  // Rank progressively — re-sorts on every query completion
  const overallRanked = useMemo((): ScoredOverall[] => {
    const pool: ScoredOverall[] = [];

    overallCandidates.forEach((s, i) => {
      const history = overallNavQ[i]?.data;
      if (!history) return;
      const metrics = computeFundMetrics(history.series);
      pool.push({ scheme: s, metrics, calmar: calmarRatio(metrics), advScore: null });
    });

    if (pool.length < 3) return [];

    const scored = pool.map((f) => ({
      ...f,
      advScore: advancedPoolScore(f, pool),
    }));

    scored.sort((a, b) => (b.advScore ?? -1) - (a.advScore ?? -1));
    return scored.slice(0, TOP_N);
  }, [overallCandidates, overallNavQ]);

  // ── Category pool — ALL Direct-Growth in selected category ───────────────

  const catCandidates = useMemo((): AMFIScheme[] => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    const direct = inCat.filter(
      (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
    );
    // Use direct-growth if we have at least 5; otherwise use all
    return direct.length >= 5 ? direct : inCat;
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
  const catDone   = catLoaded === catTotal && catTotal > 0;

  const catRanked = useMemo((): CatRow[] => {
    const rows: CatRow[] = catCandidates.map((s, i) => {
      const history = catNavQ[i]?.data;
      if (!history) {
        return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null };
      }
      const m = computeFundMetrics(history.series);
      return {
        ...s,
        score: quantFundScore(m),
        ret1y: m.ret1y,
        cagr3y: m.cagr3y,
        sharpe: m.sharpe,
        maxDD: m.maxDrawdown,
      };
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
            <p className="font-mono text-xs text-muted-foreground">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
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

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {universeSize.toLocaleString()} active schemes · full-universe rankings
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="NAV data updates once daily after market close." />
        </div>

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={Layers} label="Universe" value={universeSize.toLocaleString()} />
          <KpiTile icon={Activity} label="Pool size"
            value={overallTotal.toLocaleString()}
            suffix={`${OVERALL_POOL_CATEGORIES.length} cats`} />
          <KpiTile icon={Star} label="Top adv. score"
            value={topAdvScore != null ? fmtNum(topAdvScore, 1) : "—"} tone="cyan" />
          <KpiTile icon={TrendingUp} label="Top cat. score"
            value={topCatScore != null ? fmtNum(topCatScore, 1) : "—"} tone="cyan" />
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TABLE 1 — Overall Top 10                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Overall Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                Advanced Score · All Categories
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All Direct-Growth schemes from {OVERALL_POOL_CATEGORIES.length} major categories, percentile-ranked on 6 risk-adjusted
              factors so debt, hybrid and equity funds compete on equal footing.
              <InfoTip text="Advanced Score = Sharpe (28%) + Sortino (22%) + Calmar = CAGR3Y/|MaxDD| (20%) + 3Y CAGR (15%) + Rolling Positive % (10%) + Max Drawdown (5%). Every factor is percentile-ranked within the entire loaded pool. A Gilt fund with excellent Sharpe can legitimately rank above a volatile Small Cap fund." />
            </p>
          </div>

          {/* Factor weight strip */}
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { label: "Sharpe",   pct: "28%", note: "Return / total vol" },
              { label: "Sortino",  pct: "22%", note: "Return / downside vol" },
              { label: "Calmar",   pct: "20%", note: "CAGR3Y / |MaxDD|" },
              { label: "3Y CAGR",  pct: "15%", note: "Compounded return" },
              { label: "Rolling+", pct: "10%", note: "% positive 1Y windows" },
              { label: "Max DD",   pct:  "5%", note: "Lower is better" },
            ].map((f) => (
              <div key={f.label}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px]">
                <span className="font-mono font-bold text-cyan">{f.pct}</span>
                <span className="text-muted-foreground">{f.label}</span>
                <span className="hidden text-muted-foreground/60 sm:block">· {f.note}</span>
              </div>
            ))}
          </div>

          {/* Loading progress */}
          <ProgressBar
            loaded={overallLoaded}
            total={overallTotal}
            label={`Overall pool (${OVERALL_POOL_CATEGORIES.length} categories)`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {overallRanked.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Scoring cross-category pool — {overallLoaded} / {overallTotal} loaded…
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 text-right font-medium">
                        Adv. Score
                        <InfoTip text="0–100 percentile score, relative to all loaded schemes in the pool. Scores shift as more funds load and the percentile distribution widens." />
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
                          className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}>

                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link to="/fund/$id" params={{ id: f.scheme.schemeCode }}
                              className="block max-w-[240px] text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                              {f.scheme.schemeName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.amc}
                            </p>
                          </td>

                          <td className="p-3">
                            <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.poolCategory}
                            </span>
                          </td>

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

                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sharpe)}`}>
                            {fmtNum(m.sharpe, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sortino)}`}>
                            {fmtNum(m.sortino, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(f.calmar)}`}>
                            {fmtNum(f.calmar, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.cagr3y)}`}>
                            {fmtPct(m.cagr3y, { signed: true })}
                          </td>
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

            <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {overallLoaded} of {overallTotal} schemes scored · top {TOP_N} shown · {OVERALL_POOL_CATEGORIES.length} categories
              </span>
              {overallDone ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-positive">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              ) : (
                <span className="font-mono text-[9px] text-muted-foreground">
                  Updating…
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Advanced Score is <span className="text-foreground">percentile-based</span> — a score of 85 means this fund outranks ~85% of the
            entire pool on the weighted composite. Scores shift as more funds load into the pool.
            Cross-category raw-return comparison is invalid; this score uses risk-adjusted ratios (Sharpe, Sortino, Calmar) that are category-neutral.
          </p>
        </section>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TABLE 2 — Category Top 10                                       */}
        {/* ════════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Category Top 10</h2>
              <span className="rounded-lg border border-border bg-surface px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                QF Score · All Schemes
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Every Direct-Growth scheme in the selected category, ranked by QuantFund Score.
              Switch category to re-load the full set instantly (React Query cache).
            </p>
          </div>

          {/* Category pills — scrollable */}
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
            {CAT_TABS.map((cat) => {
              const count = activeSchemes.filter(
                (s) => classifyAMFICategory(s.category) === cat,
              ).length;
              if (count === 0) return null;
              return (
                <button key={cat}
                  onClick={() => setActiveCategory(cat)}
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

          {/* Loading progress for category */}
          <ProgressBar
            loaded={catLoaded}
            total={catTotal}
            label={`${activeCategory} (all ${catTotal} schemes)`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
                {activeCategory} · Top {TOP_N}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {catCandidates.length} schemes in pool
              </span>
            </div>

            {catCandidates.length === 0 ? (
              <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                No schemes found in {activeCategory}
              </div>
            ) : catRanked.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Loading {activeCategory} schemes…
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 text-right font-medium">
                        QF Score
                        <InfoTip text="QuantFund Score: CAGR3Y (35%) + Sharpe (25%) + Max Drawdown (20%) + Rolling 1Y Positive % (20%). Only valid within the same category." />
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
                          className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}>
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
                              {s.amc} · ₹{s.nav.toFixed(2)}
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
                {catLoaded}/{catTotal} loaded · top {TOP_N} shown
              </span>
              <Link to="/rankings"
                className="font-mono text-[9px] uppercase tracking-wider text-cyan transition-colors hover:text-cyan/80">
                Full rankings →
              </Link>
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">QuantFund Score</span> is within-category only — not valid across categories.
            Data: <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer"
              className="text-cyan underline underline-offset-2">AMFI India</a>{" "}
            &{" "}
            <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer"
              className="text-cyan underline underline-offset-2">mfapi.in</a>.
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
        <Icon className={`h-3.5 w-3.5 opacity-70 ${iconClass}`} aria-hidden="true" />
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
