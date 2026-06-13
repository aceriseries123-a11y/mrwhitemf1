import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Trophy, CheckCircle2,
  ChevronDown, ChevronUp, ShieldCheck, Zap, Search, X,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, type QuantFundCategory } from "@/lib/categories";
import { fetchNavHistoryBatch, type NavPoint } from "@/lib/nav-history";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100; // codes per nav-batch request

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = AMFIScheme & {
  quantCategory: QuantFundCategory;
  engineMetrics: EngineMetrics | null;
  scoreResult: EngineScoreResult | null;
  globalRank: number;
  categoryRank: number;
  totalInCategory: number;
};

// ─── Helper components ────────────────────────────────────────────────────────

function PillarBar({ label, score, weight, available }: {
  label: string; score: number; weight: number; available: boolean;
}) {
  const { color } = available ? getRating(score) : { color: "text-muted-foreground" };
  return (
    <div className="flex items-center gap-2">
      <span className="w-[148px] shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
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
      rank <= 3
        ? "border-cyan/30 bg-cyan/[0.02] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
        : rank <= 10
        ? "border-border/80 bg-surface/80"
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
                onClick={(e) => e.stopPropagation()}
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
                {sw.strengths.map((s) => (
                  <span key={s} className="flex items-center gap-0.5 rounded border border-positive/20 bg-positive/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-positive">
                    <Zap className="h-2 w-2" />{s}
                  </span>
                ))}
                {sw.weaknesses.map((w) => (
                  <span key={w} className="flex items-center gap-0.5 rounded border border-negative/20 bg-negative/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-negative">
                    <ShieldCheck className="h-2 w-2" />{w}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Score block */}
          {sr && ratingInfo ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-3xl font-black tabular-nums leading-none text-cyan">
                  {sr.fundScore}
                </span>
                <span className="font-mono text-[8px] text-muted-foreground">/100</span>
              </div>
              <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${ratingInfo.bg} ${ratingInfo.color}`}>
                {sr.rating}
              </span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[8px] text-muted-foreground">Confidence</span>
                <span className="font-mono text-[10px] font-bold tabular-nums text-foreground">
                  {sr.confidenceScore}
                </span>
              </div>
              {expanded ? <ChevronUp className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
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
            {/* Pillar scores */}
            <div className="space-y-1.5">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Pillar Scores</p>
              <PillarBar label="Long-Term Consistency" score={sr.pillars.longTermConsistency.rawScore} weight={23} available={sr.pillars.longTermConsistency.available} />
              <PillarBar label="Short-Term Perf." score={sr.pillars.shortTermPerformance.rawScore} weight={5} available={sr.pillars.shortTermPerformance.available} />
              <PillarBar label="Risk-Adjusted" score={sr.pillars.riskAdjusted.rawScore} weight={20} available={sr.pillars.riskAdjusted.available} />
              <PillarBar label="Downside Protection" score={sr.pillars.downsideProtection.rawScore} weight={20} available={sr.pillars.downsideProtection.available} />
              <PillarBar label="Cost Efficiency" score={0} weight={15} available={false} />
              <PillarBar label="Portfolio Quality" score={0} weight={12} available={false} />
              <PillarBar label="Management & AUM" score={0} weight={5} available={false} />
            </div>

            {/* Key metrics grid */}
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Key Metrics</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  { label: "3Y CAGR",   v: em.cagr3y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "5Y CAGR",   v: em.cagr5y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Sortino",   v: em.sortino,          fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Sharpe",    v: em.sharpe,           fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Info Ratio",v: em.informationRatio, fmt: (x: number) => fmtNum(x, 2) },
                  { label: "Beta",      v: em.beta,             fmt: (x: number) => fmtNum(x, 2) },
                  { label: "↓ Capture", v: em.downsideCapture,  fmt: (x: number) => `${fmtNum(x, 1)}%` },
                  { label: "↑ Capture", v: em.upsideCapture,    fmt: (x: number) => `${fmtNum(x, 1)}%` },
                  { label: "Max DD",    v: em.maxDrawdown,      fmt: (x: number) => fmtPct(x, { signed: true }) },
                  { label: "Recovery",  v: em.recoveryMonths,   fmt: (x: number) => `${fmtNum(x, 1)} mo` },
                  { label: "Std Dev",   v: em.stdDev,           fmt: (x: number) => fmtPct(x) },
                  { label: "History",   v: em.historyYears,     fmt: (x: number) => `${fmtNum(x, 1)} yr` },
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
                Confidence {sr.confidenceScore}/100 · {em.dataPoints.toLocaleString()} NAV points ·
                Cat rank {row.categoryRank}/{row.totalInCategory} in {row.quantCategory}
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

  // All active direct-growth schemes across ALL categories
  const allCandidates = useMemo(() => {
    if (!allSchemes) return [];
    const active = filterActiveSchemes(allSchemes);
    const direct = active.filter(
      (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
    );
    return direct.length >= 50 ? direct : active;
  }, [allSchemes]);

  // Split into batches of BATCH_SIZE for the server-side batch endpoint
  const batches = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
      out.push(allCandidates.slice(i, i + BATCH_SIZE).map((s) => s.schemeCode));
    }
    return out;
  }, [allCandidates]);

  // One React Query per batch — all fire in parallel
  const batchQueries = useQueries({
    queries: batches.map((codes) => ({
      queryKey: ["nav-batch", codes.join(",")],
      queryFn: () => fetchNavHistoryBatch(codes),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  // Progress counters
  const batchesLoaded = batchQueries.filter((q) => q.isSuccess || q.isError).length;
  const batchesTotal = batchQueries.length;
  const progressPct = batchesTotal > 0 ? Math.round((batchesLoaded / batchesTotal) * 100) : 0;
  const isLoadingData = batchesLoaded < batchesTotal;

  // Merge all batch results into one code → series map
  const seriesMap = useMemo(() => {
    const map = new Map<string, NavPoint[]>();
    for (const q of batchQueries) {
      if (!q.data) continue;
      for (const [code, hist] of Object.entries(q.data)) {
        if (hist?.series?.length) map.set(code, hist.series);
      }
    }
    return map;
  }, [batchQueries]);

  // Two-pass scoring:
  //   1. Group loaded funds by category
  //   2. Build benchmark per category
  //   3. Compute metrics (with benchmark)
  //   4. Score vs peers
  //   5. Flatten and sort globally
  const ranked = useMemo((): Row[] => {
    // Collect loaded funds
    const loaded: { scheme: AMFIScheme; series: NavPoint[]; cat: QuantFundCategory }[] = [];
    for (const scheme of allCandidates) {
      const series = seriesMap.get(scheme.schemeCode);
      if (!series) continue;
      loaded.push({ scheme, series, cat: classifyAMFICategory(scheme.category) });
    }
    if (!loaded.length) return [];

    // Group by category
    const byCategory = new Map<QuantFundCategory, typeof loaded>();
    for (const item of loaded) {
      let arr = byCategory.get(item.cat);
      if (!arr) { arr = []; byCategory.set(item.cat, arr); }
      arr.push(item);
    }

    const allRows: Row[] = [];

    for (const [cat, entries] of byCategory) {
      if (entries.length < 2) continue;

      // Build category benchmark
      const benchmark = buildBenchmark(entries.map((e) => e.series));

      // Compute per-fund metrics (with benchmark if available)
      const metricsList = entries.map((e) => computeEngineMetrics(e.series, benchmark));

      // Score each fund against its category peers
      entries.forEach((e, i) => {
        const em = metricsList[i];
        const sr = scoreWithPeers(em, metricsList);
        allRows.push({
          ...e.scheme,
          quantCategory: cat,
          engineMetrics: em,
          scoreResult: sr,
          globalRank: 0,   // filled below
          categoryRank: 0, // filled below
          totalInCategory: entries.length,
        });
      });
    }

    // Sort globally by fund score
    allRows.sort((a, b) => (b.scoreResult?.fundScore ?? -1) - (a.scoreResult?.fundScore ?? -1));

    // Assign global rank
    allRows.forEach((r, i) => { r.globalRank = i + 1; });

    // Assign category rank (first time a category appears = rank 1, since list is sorted by score)
    const catRankCounter = new Map<QuantFundCategory, number>();
    for (const row of allRows) {
      const cur = (catRankCounter.get(row.quantCategory) ?? 0) + 1;
      catRankCounter.set(row.quantCategory, cur);
      row.categoryRank = cur;
    }

    return allRows;
  }, [allCandidates, seriesMap]);

  // Search filter (applied at display time only, does not affect scoring)
  const filteredRows = useMemo(() => {
    if (!search.trim()) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(
      (r) =>
        r.schemeName.toLowerCase().includes(q) ||
        r.amc.toLowerCase().includes(q) ||
        r.quantCategory.toLowerCase().includes(q) ||
        r.schemeCode.includes(q),
    );
  }, [ranked, search]);

  // ── Error state ──────────────────────────────────────────────────────────
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

  // ── Schemes loading ──────────────────────────────────────────────────────
  if (schemesLoading || !allSchemes) {
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
              All Schemes · 7-Pillar Engine · Category-Fair Scoring
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="Scores are always computed within each fund's category peer group." />
        </div>

        {/* Loading progress bar */}
        {batchesTotal > 0 && (
          <div className="rounded-xl border border-border bg-surface/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isLoadingData ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                )}
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
                  {isLoadingData
                    ? `Loading NAV data… ${batchesLoaded}/${batchesTotal} batches`
                    : `All data loaded — ${ranked.length.toLocaleString()} funds scored`}
                </span>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-cyan transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-muted-foreground">
              <span>
                {seriesMap.size.toLocaleString()} / {allCandidates.length.toLocaleString()} funds loaded
              </span>
              <span>{ranked.length.toLocaleString()} funds scored so far</span>
            </div>
          </div>
        )}

        {/* Pillar weight reference */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface/60">
          <div className="border-b border-border/40 px-4 py-2">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan">
              QuantFund Scoring Engine — Pillar Weights
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 py-3 sm:grid-cols-7">
            {[
              { name: "Long-Term Consistency", w: 23, live: true },
              { name: "Short-Term", w: 5, live: true },
              { name: "Risk-Adjusted", w: 20, live: true },
              { name: "Downside Protection", w: 20, live: true },
              { name: "Cost Efficiency", w: 15, live: false },
              { name: "Portfolio Quality", w: 12, live: false },
              { name: "Mgmt & AUM", w: 5, live: false },
            ].map(({ name, w, live }) => (
              <div key={name} className={`rounded-lg border p-2 ${live ? "border-border bg-background" : "border-border/30 bg-background/30 opacity-50"}`}>
                <p className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground leading-tight">{name}</p>
                <p className={`mt-1 font-display text-base font-black tabular-nums ${live ? "text-foreground" : "text-muted-foreground"}`}>{w}%</p>
                <p className={`font-mono text-[7px] uppercase tracking-widest ${live ? "text-positive" : "text-muted-foreground"}`}>
                  {live ? "● Live" : "○ Phase 2"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by fund name, AMC, category, or scheme code…"
            className="w-full rounded-xl border border-border bg-surface px-9 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
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
          {isLoadingData && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Scoring {ranked.length} / {allCandidates.length}…
            </span>
          )}
        </div>

        {/* Score cards */}
        {filteredRows.length === 0 && !isLoadingData ? (
          <div className="rounded-xl border border-border py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {search ? `No funds match "${search}"` : "Loading fund data…"}
          </div>
        ) : (
          <div className="space-y-2 pb-8">
            {filteredRows.map((row) => (
              <ScoreCard
                key={row.schemeCode}
                row={row}
                rank={search ? row.globalRank : row.globalRank}
                expanded={expandedCode === row.schemeCode}
                onToggle={() =>
                  setExpandedCode(expandedCode === row.schemeCode ? null : row.schemeCode)
                }
              />
            ))}
            {isLoadingData && ranked.length > 0 && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border border-dashed py-6 font-mono text-[10px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" />
                Loading more funds… {batchesLoaded}/{batchesTotal} batches complete
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="pb-8 text-[10px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Scoring:</strong> Fund Score (0–100) is the weighted percentile rank across
          4 live pillars. Information Ratio, Beta, and Capture Ratios use the category equal-weighted NAV benchmark.
          Scores are computed within each fund's category peer group — cross-category comparison is invalid.
          Data: {" "}
          <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}&amp; <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Research tool only — not investment advice.
        </p>
      </div>
    </AppShell>
  );
}
