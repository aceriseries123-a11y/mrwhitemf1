import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Trophy, CheckCircle2,
  ChevronDown, ChevronUp, ShieldCheck, Zap, Search, X, Info,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";
import { fetchNavHistory } from "@/lib/nav-history";
import type { NavPoint } from "@/lib/nav-history";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import {
  computeEngineMetrics,
  buildBenchmark,
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
      { name: "description", content: "All mutual funds ranked by the 7-pillar QuantFund Scoring Engine. Category-fair, NAV-verified." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
  component: Rankings,
});

// ─── All recognised categories (same set as dashboard) ───────────────────────
const ALL_CATEGORIES = QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[];

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = AMFIScheme & {
  quantCategory: QuantFundCategory;
  engineMetrics: EngineMetrics | null;
  scoreResult: EngineScoreResult | null;
  globalRank: number;
  categoryRank: number;
  totalInCategory: number;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-30 hidden w-64 rounded-xl border border-border bg-surface p-2.5 text-[10px] normal-case leading-relaxed tracking-normal text-foreground shadow-2xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function PillarBar({ label, score, weight, available, isProxy }: {
  label: string; score: number; weight: number; available: boolean; isProxy?: boolean;
}) {
  const { color } = available ? getRating(score) : { color: "text-muted-foreground" };
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-[152px] shrink-0 items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {isProxy && available && (
          <span className="rounded border border-warning/30 bg-warning/[0.07] px-0.5 font-mono text-[6px] uppercase text-warning">
            proxy
          </span>
        )}
      </div>
      <div className="flex flex-1 items-center gap-2">
        {available ? (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-cyan transition-all duration-700" style={{ width: `${score}%` }} />
            </div>
            <span className={`w-8 text-right font-mono text-[10px] font-bold tabular-nums ${color}`}>
              {Math.round(score)}
            </span>
          </>
        ) : (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border opacity-20" />
            <span className="w-8 text-right font-mono text-[9px] text-muted-foreground">N/A</span>
          </>
        )}
        <span className="w-5 text-right font-mono text-[9px] text-muted-foreground opacity-40">{weight}%</span>
      </div>
    </div>
  );
}

function ScoreCard({ row, rank, expanded, onToggle }: {
  row: Row; rank: number; expanded: boolean; onToggle: () => void;
}) {
  const sr = row.scoreResult;
  const ratingInfo = sr ? getRating(sr.fundScore) : null;
  const sw = sr ? getStrengthsWeaknesses(sr.pillars) : null;
  const em = row.engineMetrics;

  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      rank <= 3  ? "border-cyan/30 bg-cyan/[0.02] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
      : rank <= 10 ? "border-border/80 bg-surface/80"
      : "border-border/50 bg-surface/40"
    }`}>
      <button className="w-full text-left" onClick={onToggle} aria-expanded={expanded}>
        <div className="flex items-center gap-3 p-4">
          {/* Rank */}
          <div className="flex w-10 shrink-0 flex-col items-center gap-0.5">
            <span className={`font-display text-xl font-black leading-none tabular-nums ${
              rank <= 3 ? "text-cyan" : "text-muted-foreground"
            }`}>
              {rank <= 3 ? ["🥇","🥈","🥉"][rank - 1] : `#${rank}`}
            </span>
            <span className="font-mono text-[7px] leading-none text-muted-foreground opacity-40">
              {row.categoryRank}/{row.totalInCategory}
            </span>
          </div>

          {/* Fund info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/fund/$id"
                params={{ id: row.schemeCode }}
                className="truncate text-sm font-semibold text-foreground transition-colors hover:text-cyan"
                onClick={e => e.stopPropagation()}
              >
                {row.schemeName}
              </Link>
              <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                {row.quantCategory}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
              {row.amc} · #{row.schemeCode} · ₹{row.nav.toFixed(2)}
            </div>
            {sw && (sw.strengths.length > 0 || sw.weaknesses.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {sw.strengths.map(s => (
                  <span key={s} className="flex items-center gap-0.5 rounded border border-positive/20 bg-positive/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-positive">
                    <Zap className="h-2 w-2" />{s}
                  </span>
                ))}
                {sw.weaknesses.map(w => (
                  <span key={w} className="flex items-center gap-0.5 rounded border border-negative/20 bg-negative/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-negative">
                    <ShieldCheck className="h-2 w-2" />{w}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Score */}
          {sr && ratingInfo ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-3xl font-black tabular-nums leading-none text-cyan">{sr.fundScore}</span>
                <span className="font-mono text-[8px] text-muted-foreground">/100</span>
              </div>
              <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${ratingInfo.bg} ${ratingInfo.color}`}>
                {sr.rating}
              </span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[8px] text-muted-foreground">Confidence</span>
                <span className="font-mono text-[10px] font-bold tabular-nums">{sr.confidenceScore}</span>
              </div>
              {expanded
                ? <ChevronUp className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && sr && em && (
        <div className="border-t border-border/60 px-4 py-4">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Pillar bars */}
            <div className="space-y-1.5">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Pillar Scores
                <InfoTip text="Proxy pillars use NAV-derived metrics as the real data feed (expense ratio, portfolio holdings, manager info) is not yet available from AMFI/mfapi.in." />
              </p>
              <PillarBar label="Long-Term Consistency" score={sr.pillars.longTermConsistency.rawScore} weight={23} available={sr.pillars.longTermConsistency.available} />
              <PillarBar label="Short-Term Perf." score={sr.pillars.shortTermPerformance.rawScore} weight={5} available={sr.pillars.shortTermPerformance.available} />
              <PillarBar label="Risk-Adjusted" score={sr.pillars.riskAdjusted.rawScore} weight={20} available={sr.pillars.riskAdjusted.available} />
              <PillarBar label="Downside Protection" score={sr.pillars.downsideProtection.rawScore} weight={20} available={sr.pillars.downsideProtection.available} />
              <PillarBar label="Cost Efficiency" score={sr.pillars.costEfficiency.rawScore} weight={15} available={sr.pillars.costEfficiency.available} isProxy />
              <PillarBar label="Portfolio Quality" score={sr.pillars.portfolioQuality.rawScore} weight={12} available={sr.pillars.portfolioQuality.available} isProxy />
              <PillarBar label="Management & AUM" score={sr.pillars.managementAUM.rawScore} weight={5} available={sr.pillars.managementAUM.available} isProxy />
            </div>

            {/* Metrics grid */}
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Key Metrics</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  { label: "3Y CAGR",   v: em.cagr3y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "5Y CAGR",   v: em.cagr5y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Sortino",   v: em.sortino,          fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Sharpe",    v: em.sharpe,           fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Info Ratio",v: em.informationRatio, fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Alpha",     v: em.longRunAlpha,     fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Calmar",    v: em.calmarRatio,      fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Beta",      v: em.beta,             fmt: (x: number) => fmtNum(x, 2) },
                  { label: "↓ Capture", v: em.downsideCapture,  fmt: (x: number) => `${fmtNum(x, 1)}%` },
                  { label: "↑ Capture", v: em.upsideCapture,    fmt: (x: number) => `${fmtNum(x, 1)}%` },
                  { label: "Max DD",    v: em.maxDrawdown,      fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Recovery",  v: em.recoveryMonths,   fmt: (x: number) => `${fmtNum(x, 1)} mo` },
                ].map(({ label, v, fmt }) => (
                  <div key={label}>
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="font-mono text-[11px] font-bold tabular-nums text-foreground">
                      {v == null ? "—" : fmt(v as number)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[8px] text-muted-foreground">
                Confidence {sr.confidenceScore}/100 · {em.dataPoints.toLocaleString()} NAV pts ·
                {em.historyYears > 0 ? ` ${fmtNum(em.historyYears, 1)} yrs history ·` : ""} Cat rank {row.categoryRank}/{row.totalInCategory}
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
  const { data: allSchemes, isLoading: schemesLoading, isError, error } = useAMFISchemes();
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Metric cache — avoids recomputing on every render as new NAV data arrives
  const metricCache = useRef<Map<string, EngineMetrics>>(new Map());

  // All active direct-growth schemes — same pool as dashboard
  const allCandidates = useMemo((): (AMFIScheme & { poolCategory: QuantFundCategory })[] => {
    if (!allSchemes) return [];
    const active = filterActiveSchemes(allSchemes);
    return ALL_CATEGORIES.flatMap(category => {
      const inCat = active.filter(s => classifyAMFICategory(s.category) === category);
      const direct = inCat.filter(
        s => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
      );
      return direct.map(s => ({ ...s, poolCategory: category }));
    });
  }, [allSchemes]);

  // Individual browser fetches — SAME queryKey as dashboard so React Query cache
  // is shared. If the user visited the dashboard first, most/all will be instant.
  // This avoids the server-side batch endpoint which gets rate-limited by mfapi.in.
  const navQueries = useQueries({
    queries: allCandidates.map(s => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn:  () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  // Progress
  const navSettled = useMemo(
    () => navQueries.filter(q => q.status === "success" || q.status === "error").length,
    [navQueries],
  );
  const navLoaded = useMemo(
    () => navQueries.filter(q => q.status === "success").length,
    [navQueries],
  );
  const navTotal  = allCandidates.length;
  const isDone    = navSettled === navTotal && navTotal > 0;
  const pct       = navTotal > 0 ? Math.round((navSettled / navTotal) * 100) : 0;

  // Build series map from loaded queries
  const seriesMap = useMemo(() => {
    const map = new Map<string, NavPoint[]>();
    allCandidates.forEach((s, i) => {
      const d = navQueries[i]?.data;
      if (d?.series?.length) map.set(s.schemeCode, d.series);
    });
    return map;
  }, [allCandidates, navQueries]);

  // Two-pass scoring (reruns progressively as more data arrives):
  //   Pass 1 — group by category, build benchmark, compute metrics
  //   Pass 2 — score each fund against its category peers
  //   Pass 3 — flatten, sort globally, assign ranks
  const ranked = useMemo((): Row[] => {
    // Group loaded funds by category
    const byCategory = new Map<QuantFundCategory, {
      scheme: AMFIScheme; series: NavPoint[];
    }[]>();

    for (const s of allCandidates) {
      const series = seriesMap.get(s.schemeCode);
      if (!series) continue;
      const cat = classifyAMFICategory(s.category);
      let arr = byCategory.get(cat);
      if (!arr) { arr = []; byCategory.set(cat, arr); }
      arr.push({ scheme: s, series });
    }

    const allRows: Row[] = [];

    for (const [cat, entries] of byCategory) {
      if (entries.length < 2) continue;

      const benchmark = buildBenchmark(entries.map(e => e.series));

      const metricsList = entries.map(e => {
        // Return cached metric if available (only recompute for new entries)
        let m = metricCache.current.get(e.scheme.schemeCode);
        if (!m) {
          m = computeEngineMetrics(e.series, benchmark);
          metricCache.current.set(e.scheme.schemeCode, m);
        }
        return m;
      });

      // Score all within category
      entries.forEach((e, i) => {
        const sr = scoreWithPeers(metricsList[i], metricsList);
        allRows.push({
          ...e.scheme,
          quantCategory:   cat,
          engineMetrics:   metricsList[i],
          scoreResult:     sr,
          globalRank:      0,
          categoryRank:    0,
          totalInCategory: entries.length,
        });
      });
    }

    // Sort globally
    allRows.sort((a, b) => (b.scoreResult?.fundScore ?? -1) - (a.scoreResult?.fundScore ?? -1));
    allRows.forEach((r, i) => { r.globalRank = i + 1; });

    // Category ranks (list is sorted by score → first occurrence per cat = rank 1)
    const catRankCount = new Map<QuantFundCategory, number>();
    for (const row of allRows) {
      const cur = (catRankCount.get(row.quantCategory) ?? 0) + 1;
      catRankCount.set(row.quantCategory, cur);
      row.categoryRank = cur;
    }

    return allRows;
  }, [allCandidates, seriesMap]);

  // Search filter (display only, does not change scoring)
  const filteredRows = useMemo(() => {
    if (!search.trim()) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(r =>
      r.schemeName.toLowerCase().includes(q) ||
      r.amc.toLowerCase().includes(q) ||
      r.quantCategory.toLowerCase().includes(q) ||
      r.schemeCode.includes(q),
    );
  }, [ranked, search]);

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <AppShell title="Rankings">
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">
              Fund data unavailable
            </p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (schemesLoading || !allSchemes) {
    return (
      <AppShell title="Rankings">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI universe…</p>
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
              All Schemes · 7-Pillar Engine · Category-Fair Scoring
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="Scores are computed within each fund's category peer group." />
        </div>

        {/* Loading progress */}
        {navTotal > 0 && (
          <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {isDone
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  : <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" />}
                {isDone
                  ? `All data loaded — ${ranked.length.toLocaleString()} funds scored`
                  : `Loading NAV data — ${navLoaded.toLocaleString()} scored`}
                <span className="opacity-60">/ {navTotal.toLocaleString()} total</span>
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isDone ? "bg-positive" : "bg-cyan"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {!isDone && navLoaded > 0 && (
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Rankings update live as data loads · {navSettled}/{navTotal} settled
              </p>
            )}
          </div>
        )}

        {/* Pillar weights */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface/60">
          <div className="border-b border-border/40 px-4 py-2">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan">
              QuantFund Scoring Engine — 7 Pillars
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 py-3 sm:grid-cols-7">
            {[
              { name: "Long-Term Consistency", w: 23, proxy: false },
              { name: "Short-Term",            w: 5,  proxy: false },
              { name: "Risk-Adjusted",         w: 20, proxy: false },
              { name: "Downside Protection",   w: 20, proxy: false },
              { name: "Cost Efficiency",       w: 15, proxy: true },
              { name: "Portfolio Quality",     w: 12, proxy: true },
              { name: "Mgmt & AUM",            w: 5,  proxy: true },
            ].map(({ name, w, proxy }) => (
              <div key={name} className="rounded-lg border border-border bg-background p-2">
                <p className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground leading-tight">{name}</p>
                <p className="mt-1 font-display text-base font-black tabular-nums text-foreground">{w}%</p>
                <p className={`font-mono text-[7px] uppercase tracking-widest ${proxy ? "text-warning" : "text-positive"}`}>
                  {proxy ? "● Proxy" : "● Live"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name, AMC, category or scheme code…"
            className="w-full rounded-xl border border-border bg-surface px-9 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/20"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
            {search
              ? `${filteredRows.length.toLocaleString()} results for "${search}"`
              : `${ranked.length.toLocaleString()} funds ranked globally`}
          </span>
          {!isDone && navLoaded > 0 && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Scoring {ranked.length}/{navTotal} …
            </span>
          )}
        </div>

        {/* Cards */}
        {filteredRows.length === 0 && !isDone ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-cyan" />
            <p className="font-mono text-[11px] uppercase tracking-widest">
              Loading fund data… {navLoaded}/{navTotal}
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            No funds match "{search}"
          </div>
        ) : (
          <div className="space-y-2 pb-8">
            {filteredRows.map(row => (
              <ScoreCard
                key={row.schemeCode}
                row={row}
                rank={row.globalRank}
                expanded={expandedCode === row.schemeCode}
                onToggle={() =>
                  setExpandedCode(expandedCode === row.schemeCode ? null : row.schemeCode)
                }
              />
            ))}
            {!isDone && ranked.length > 0 && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 font-mono text-[10px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" />
                Fetching remaining funds… {navSettled}/{navTotal} complete
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="pb-8 text-[10px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Scoring:</strong> Fund Score (0–100) uses all 7 pillars.
          Pillars 1–4 use real NAV metrics; Pillars 5–7 use NAV-derived proxies (Alpha, Calmar, Rolling Consistency, Fund Longevity)
          until expense-ratio and portfolio-holdings feeds are integrated.
          All scoring is category-relative — cross-category comparison is not valid.
          Data: {" "}
          <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}&amp; <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Research tool — not investment advice. Last updated: {asOf ?? "—"}.
        </p>
      </div>
    </AppShell>
  );
}
