import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, Trophy, CheckCircle2,
  ChevronDown, ChevronUp, ShieldCheck, Zap,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, type QuantFundCategory } from "@/lib/categories";
import { fetchNavHistory } from "@/lib/nav-history";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import {
  computeEngineMetrics,
  scoreWithPeers,
  getRating,
  getStrengthsWeaknesses,
  type EngineMetrics,
  type EngineScoreResult,
} from "@/lib/scoring-engine";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "Institutional-style mutual fund scoring engine — 7-pillar, category-scoped, NAV-verified." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:description", content: "Top Indian mutual funds ranked within each category by the QuantFund Scoring Engine." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
  component: Rankings,
});

// ─── Constants ────────────────────────────────────────────────────────────────

type BroadTab = "Equity" | "Hybrid" | "Debt" | "Index / ETF" | "Gold & Intl";

const BROAD_TABS: BroadTab[] = ["Equity", "Hybrid", "Debt", "Index / ETF", "Gold & Intl"];

const CATEGORIES_BY_BROAD: Record<BroadTab, QuantFundCategory[]> = {
  Equity: [
    "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap",
    "Large & Mid Cap", "ELSS", "Focused", "Sectoral / Thematic", "Dividend Yield",
  ],
  Hybrid: [
    "Aggressive Hybrid", "Conservative Hybrid", "Balanced Advantage",
    "Multi Asset", "Arbitrage",
  ],
  Debt: [
    "Short Duration", "Medium Duration", "Long Duration", "Dynamic Bond",
    "Corporate Bond", "Credit Risk", "Banking & PSU", "Gilt",
    "Liquid", "Ultra Short Duration", "Low Duration", "Money Market", "Floater",
  ],
  "Index / ETF": ["Index Fund", "ETF"],
  "Gold & Intl": ["Gold", "International / FoF"],
};

const TOP_N = 25; // display limit

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = AMFIScheme & {
  engineMetrics: EngineMetrics | null;
  scoreResult: EngineScoreResult | null;
  categoryRank: number;
  totalInCategory: number;
};

// ─── Helper components ────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-20 hidden w-64 rounded-xl border border-border bg-surface p-2.5 text-[10px] normal-case tracking-normal text-foreground shadow-xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function PillarBar({
  label, score, weight, available,
}: {
  label: string; score: number; weight: number; available: boolean;
}) {
  const { color } = available
    ? getRating(score)
    : { color: "text-muted-foreground" };

  return (
    <div className="flex items-center gap-2">
      <span className="w-[148px] shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 items-center gap-2">
        {available ? (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-cyan transition-all duration-700"
                style={{ width: `${score}%` }}
              />
            </div>
            <span className={`w-8 text-right font-mono text-[10px] font-bold tabular-nums ${color}`}>
              {Math.round(score)}
            </span>
          </>
        ) : (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border opacity-30" />
            <span className="w-8 text-right font-mono text-[9px] text-muted-foreground">N/A</span>
          </>
        )}
        <span className="w-5 text-right font-mono text-[9px] text-muted-foreground opacity-50">
          {weight}%
        </span>
      </div>
    </div>
  );
}

function ScoreCard({ row, expanded, onToggle }: {
  row: Row; expanded: boolean; onToggle: () => void;
}) {
  const sr = row.scoreResult;
  const ratingInfo = sr ? getRating(sr.fundScore) : null;
  const sw = sr ? getStrengthsWeaknesses(sr.pillars) : null;

  return (
    <div className={`group rounded-xl border transition-all duration-200 ${
      row.categoryRank <= 3
        ? "border-cyan/30 bg-cyan/[0.02] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
        : "border-border bg-surface/60"
    }`}>
      {/* Main row */}
      <button
        className="w-full text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4 p-4">
          {/* Rank */}
          <div className="flex w-9 shrink-0 flex-col items-center">
            <span className={`font-display text-lg font-black tabular-nums leading-none ${
              row.categoryRank <= 3 ? "text-cyan" : "text-muted-foreground"
            }`}>
              {row.categoryRank <= 3 ? ["🥇","🥈","🥉"][row.categoryRank - 1] : row.categoryRank}
            </span>
            <span className="mt-0.5 font-mono text-[8px] text-muted-foreground opacity-50">
              /{row.totalInCategory}
            </span>
          </div>

          {/* Fund info */}
          <div className="min-w-0 flex-1">
            <Link
              to="/fund/$id"
              params={{ id: row.schemeCode }}
              className="block truncate text-sm font-semibold leading-tight text-foreground transition-colors hover:text-cyan"
              onClick={(e) => e.stopPropagation()}
            >
              {row.schemeName}
            </Link>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {row.amc} · #{row.schemeCode} · NAV ₹{row.nav.toFixed(2)}
            </div>
            {/* Strengths / Weaknesses chips */}
            {sw && (sw.strengths.length > 0 || sw.weaknesses.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {sw.strengths.map((s) => (
                  <span key={s} className="flex items-center gap-0.5 rounded-md border border-positive/20 bg-positive/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-positive">
                    <Zap className="h-2 w-2" />{s}
                  </span>
                ))}
                {sw.weaknesses.map((w) => (
                  <span key={w} className="flex items-center gap-0.5 rounded-md border border-negative/20 bg-negative/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-negative">
                    <ShieldCheck className="h-2 w-2" />{w}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Score block */}
          {sr && ratingInfo ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {/* Fund Score */}
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-black tabular-nums leading-none text-cyan">
                  {sr.fundScore}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">/100</span>
              </div>
              {/* Rating badge */}
              <span className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${ratingInfo.bg} ${ratingInfo.color}`}>
                {sr.rating}
              </span>
              {/* Confidence */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[8px] text-muted-foreground">Confidence</span>
                <span className="font-mono text-[10px] font-bold tabular-nums text-foreground">
                  {sr.confidenceScore}
                </span>
              </div>
              {/* Expand toggle */}
              <div className="mt-0.5 text-muted-foreground">
                {expanded
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>
          ) : row.engineMetrics === null ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">Scoring…</span>
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && sr && (
        <div className="border-t border-border/60 px-4 py-4">
          <div className="grid gap-y-0.5 sm:grid-cols-2 sm:gap-x-8">
            {/* Left column */}
            <div className="space-y-1.5">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Pillar Scores
              </p>
              <PillarBar label="Long-Term Consistency" score={sr.pillars.longTermConsistency.rawScore} weight={23} available={sr.pillars.longTermConsistency.available} />
              <PillarBar label="Short-Term Perf." score={sr.pillars.shortTermPerformance.rawScore} weight={5} available={sr.pillars.shortTermPerformance.available} />
              <PillarBar label="Risk-Adjusted" score={sr.pillars.riskAdjusted.rawScore} weight={20} available={sr.pillars.riskAdjusted.available} />
              <PillarBar label="Downside Protection" score={sr.pillars.downsideProtection.rawScore} weight={20} available={sr.pillars.downsideProtection.available} />
              <PillarBar label="Cost Efficiency" score={0} weight={15} available={false} />
              <PillarBar label="Portfolio Quality" score={0} weight={12} available={false} />
              <PillarBar label="Management & AUM" score={0} weight={5} available={false} />
            </div>

            {/* Right column — key metrics */}
            <div className="mt-4 sm:mt-0">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Key Metrics
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "3Y CAGR",   v: row.engineMetrics?.cagr3y,        fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "5Y CAGR",   v: row.engineMetrics?.cagr5y,        fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Sharpe",    v: row.engineMetrics?.sharpe,         fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Sortino",   v: row.engineMetrics?.sortino,        fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Max DD",    v: row.engineMetrics?.maxDrawdown,    fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Std Dev",   v: row.engineMetrics?.stdDev,         fmt: (x: number) => fmtPct(x) },
                  { label: "Recovery",  v: row.engineMetrics?.recoveryMonths, fmt: (x: number) => `${fmtNum(x, 1)} mo` },
                  { label: "History",   v: row.engineMetrics?.historyYears,   fmt: (x: number) => `${fmtNum(x, 1)} yr` },
                ].map(({ label, v, fmt }) => (
                  <div key={label}>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className={`font-mono text-[11px] font-bold tabular-nums ${
                      v == null ? "text-muted-foreground" :
                      label === "Max DD" ? (v < -0.3 ? "text-negative" : v < -0.15 ? "text-warning" : "text-positive") :
                      label === "Std Dev" || label === "Recovery" ? "text-foreground" :
                      "text-foreground"
                    }`}>
                      {v == null ? "—" : fmt(v as number)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[8px] text-muted-foreground">
                Score confidence {sr.confidenceScore}/100 · Based on {row.engineMetrics?.historyYears
                  ? `${fmtNum(row.engineMetrics.historyYears, 1)} yrs NAV history`
                  : "limited history"
                } · {row.engineMetrics?.dataPoints.toLocaleString()} NAV points
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function Rankings() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeTab, setActiveTab] = useState<BroadTab>("Equity");
  const [activeCategory, setActiveCategory] = useState<QuantFundCategory>("Large Cap");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  // Candidate funds for the active category (all direct-growth, no pre-slice)
  const candidates = useMemo(() => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    const direct = inCat.filter(
      (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
    );
    return direct.length >= 10 ? direct : inCat;
  }, [activeSchemes, activeCategory]);

  // Fetch NAV history for every candidate (category-scoped)
  const navQueries = useQueries({
    queries: candidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const navLoaded = navQueries.filter((q) => q.data).length;
  const navTotal = navQueries.length;
  const allReady = navLoaded === navTotal && navTotal > 0;

  // Two-pass scoring:
  //   Pass 1 — compute raw EngineMetrics for every loaded fund
  //   Pass 2 — score each fund against the full peer set
  const ranked = useMemo((): Row[] => {
    // Pass 1
    const metricsList: (EngineMetrics | null)[] = candidates.map((_, i) => {
      const data = navQueries[i]?.data;
      return data ? computeEngineMetrics(data.series) : null;
    });

    const peerMetrics = metricsList.filter((m): m is EngineMetrics => m != null);

    // Pass 2
    const rows: Row[] = candidates.map((s, i) => {
      const em = metricsList[i];
      const sr = em && peerMetrics.length > 1
        ? scoreWithPeers(em, peerMetrics)
        : null;
      return { ...s, engineMetrics: em, scoreResult: sr, categoryRank: 0, totalInCategory: candidates.length };
    });

    // Sort by fund score (nulls last)
    rows.sort((a, b) => {
      const sa = a.scoreResult?.fundScore ?? -1;
      const sb = b.scoreResult?.fundScore ?? -1;
      return sb - sa;
    });

    // Assign category rank
    rows.forEach((r, i) => { r.categoryRank = i + 1; });

    return rows.slice(0, TOP_N);
  }, [candidates, navQueries]);

  const handleTabChange = (tab: BroadTab) => {
    setActiveTab(tab);
    setActiveCategory(CATEGORIES_BY_BROAD[tab][0]);
    setExpandedCode(null);
  };

  const handleCategoryChange = (cat: QuantFundCategory) => {
    setActiveCategory(cat);
    setExpandedCode(null);
  };

  if (isError) {
    return (
      <AppShell title="Rankings">
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">
              Fund data unavailable
            </p>
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Rankings">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI fund universe…</p>
        </div>
      </AppShell>
    );
  }

  const asOf = allSchemes[0]?.date ?? null;

  return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-4xl space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Rankings</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              7-Pillar Scoring Engine · Category-Scoped · {activeSchemes.length.toLocaleString()} Schemes
            </p>
          </div>
          <DataSourceBadge
            source="AMFI + mfapi.in"
            asOf={asOf}
            note="Rankings are always within-category. Cross-category comparison is invalid."
          />
        </div>

        {/* Score formula strip */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface/60">
          <div className="border-b border-border/40 px-4 py-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
              QuantFund Scoring Engine — Pillar Weights
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { name: "Long-Term Consistency", w: 23, live: true },
              { name: "Short-Term Perf.", w: 5, live: true },
              { name: "Risk-Adjusted", w: 20, live: true },
              { name: "Downside Protection", w: 20, live: true },
              { name: "Cost Efficiency", w: 15, live: false },
              { name: "Portfolio Quality", w: 12, live: false },
              { name: "Management & AUM", w: 5, live: false },
            ].map(({ name, w, live }) => (
              <div key={name} className={`rounded-lg border p-2 ${live ? "border-border bg-background" : "border-border/40 bg-background/40 opacity-50"}`}>
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                  {name}
                </p>
                <p className={`mt-1 font-display text-base font-black tabular-nums ${live ? "text-foreground" : "text-muted-foreground"}`}>
                  {w}%
                </p>
                <p className={`font-mono text-[7px] uppercase tracking-widest ${live ? "text-positive" : "text-muted-foreground"}`}>
                  {live ? "● Live" : "○ Phase 2"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Broad tabs */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {BROAD_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`shrink-0 rounded-lg px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-150 ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Sub-category pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {CATEGORIES_BY_BROAD[activeTab].map((cat) => {
            const count = activeSchemes.filter(
              (s) => classifyAMFICategory(s.category) === cat,
            ).length;
            return (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-150 ${
                  cat === activeCategory
                    ? "bg-cyan text-background shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                    : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                }`}
              >
                {cat}
                <span className="ml-1.5 opacity-50">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Leaderboard header */}
        <div className="flex items-center justify-between rounded-t-xl border border-border bg-background/60 px-4 py-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
            Top {TOP_N} — {activeCategory}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {allReady ? (
                <><CheckCircle2 className="h-3 w-3 text-positive" />{navLoaded} scored</>
              ) : (
                <><Loader2 className="h-3 w-3 animate-spin" />Scoring {navLoaded}/{navTotal}</>
              )}
              <InfoTooltip text="Funds are scored in two passes: metrics are computed per fund, then percentile-ranked within the category peer group. Only Direct-Growth plans shown." />
            </span>
          </div>
        </div>

        {/* Score cards */}
        {candidates.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            No schemes found in {activeCategory}
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((row) => (
              <ScoreCard
                key={row.schemeCode}
                row={row}
                expanded={expandedCode === row.schemeCode}
                onToggle={() =>
                  setExpandedCode(
                    expandedCode === row.schemeCode ? null : row.schemeCode,
                  )
                }
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="space-y-2 pb-8">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Scoring methodology:</strong> Fund Score (0–100) is the
            weighted average of percentile ranks across 4 live pillars (68% of total weight — categories 5–7
            require expense ratio and portfolio data not yet available). Score is normalized to 0–100 within
            available pillars. Confidence Score (0–100) reflects fund history length and data completeness.
            Both scores are category-relative — comparison across categories is invalid.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Data: {" "}
            <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
            {" "}&amp;{" "}
            <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>
            . Last updated: {asOf ?? "—"}.
            This is a research tool, not investment advice.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
