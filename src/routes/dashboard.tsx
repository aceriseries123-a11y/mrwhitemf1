/**
 * dashboard.tsx
 *
 * TABLE 1 — Overall Top 10 (Advanced cross-category score)
 *   Pool: ALL Direct-Growth schemes across EVERY recognised AMFI category.
 *   No per-category or total cap. Each fund's metrics are memoised so the
 *   percentile recomputation on each new arrival is O(n), not O(n²).
 *   6 factors, all percentile-ranked within the full loaded pool:
 *     Sharpe 28 · Sortino 22 · Calmar 20 · CAGR3Y 15 · Rolling+ 10 · MaxDD 5
 *
 * TABLE 2 — Category Top 10 (QuantFund Score within category)
 *   Pool: ALL active Growth plans (Direct + Regular) in the selected category.
 *   No count cap. Direct plans are badged for clarity.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, TrendingUp, Layers,
  CheckCircle2, Star, BarChart2, Activity, Medal,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import {
  classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory,
} from "../lib/categories";
import { fetchNavHistory, type NavHistory, type NavPoint } from "../lib/nav-history";
import { fmtPct, fmtNum } from "../lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { storeSeries, mergeCategoryIntoStore, subscribeToRankedList, getFullRankedList, type RankedFund } from "../lib/fund-store";
import { computeEngineMetrics, buildBenchmark, scoreWithPeers, type EngineMetrics } from "../lib/scoring-engine";
import { saveEngineCache, loadEngineCache } from "../lib/engine-cache";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      {
        name: "description",
        content:
          "Full-universe fund rankings — all AMFI Direct-Growth schemes across every category, scored with a 6-factor percentile-normalised Advanced Score.",
      },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Full-universe quant rankings from real NAV history." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

// ─── Pool config ──────────────────────────────────────────────────────────────
// Every recognised AMFI category (excluding "Unknown") participates in the
// overall pool. No count cap — every Direct-Growth scheme in every category
// is fetched and scored.

const OVERALL_POOL_CATEGORIES = QUANTFUND_CATEGORIES.filter(
  (c) => c !== "Unknown",
) as QuantFundCategory[];

// Category picker tabs — all recognised categories
const CAT_TABS: QuantFundCategory[] = [
  // Equity
  "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap", "Large & Mid Cap",
  "ELSS", "Focused", "Sectoral / Thematic", "Dividend Yield",
  // Hybrid
  "Aggressive Hybrid", "Balanced Advantage", "Conservative Hybrid", "Arbitrage", "Multi Asset",
  // Debt
  "Liquid", "Overnight", "Ultra Short Duration", "Low Duration", "Short Duration",
  "Medium Duration", "Medium to Long Duration", "Long Duration",
  "Dynamic Bond", "Corporate Bond", "Credit Risk", "Banking & PSU",
  "Gilt", "Gilt 10Y", "Floater", "Money Market",
  // Index / ETF
  "Index Fund", "ETF",
  // International / Gold / Solution
  "International / FoF", "Gold", "Retirement", "Children",
];

const TOP_N = 10;


// ─── Types ─────────────────────────────────────────────────────────────────────

type PoolEntry = AMFIScheme & { poolCategory: QuantFundCategory };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle" role="tooltip" aria-label={text}>
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

function ProgressBar({
  settled, loaded, total, label, noData,
}: { settled: number; loaded: number; total: number; label: string; noData?: number }) {
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const done = settled === total && total > 0;
  return (
    <div className="mb-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {done
            ? <CheckCircle2 className="h-3 w-3 text-positive" />
            : <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
          {label} — {loaded.toLocaleString()} scored
          <span className="opacity-60">/ {total.toLocaleString()} total</span>
          {done && noData != null && noData > 0 && (
            <span className="opacity-50">· {noData.toLocaleString()} no mfapi data</span>
          )}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-positive" : "bg-cyan"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!done && settled > 0 && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Ranking updates live · {settled}/{total} settled
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

  // ── Overall pool ─────────────────────────────────────────────────────────
  // Strict Direct-Growth schemes only across every AMFI category. No fallback.

  const overallCandidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];

    return OVERALL_POOL_CATEGORIES.flatMap((category) => {
      const inCat = activeSchemes.filter(
        (s) => classifyAMFICategory(s.category) === category,
      );
      // Strict Direct-Growth only — no IDCW, no Regular, no fallback
      const directGrowth = inCat.filter(
        (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
      );
      return directGrowth.map((s) => ({ ...s, poolCategory: category }));
    });
  }, [activeSchemes]);

  // ── Overall pool — individual browser fetches with engine-cache ─────────
  // mfapi.in rate-limits server-side batch requests (shared CF Worker IP).
  // Browser fetches with high concurrency (100) are reliable and fast.
  // Computed metrics are cached in engine-cache (localStorage) so reloads are instant.

  // Skip fetching funds whose engine metrics are already cached for today
  const engineCacheOnMount = useRef(loadEngineCache());
  const freshCandidates = useMemo(
    () => overallCandidates.filter((s) => !engineCacheOnMount.current.has(s.schemeCode)),
    [overallCandidates],
  );

  const overallNavQ = useQueries({
    queries: freshCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  // Fast map of newly-fetched NAV history (fresh this session only)
  const freshNavMap = useMemo(() => {
    const map = new Map<string, NavHistory>();
    freshCandidates.forEach((s, i) => {
      const h = overallNavQ[i]?.data;
      if (h) map.set(s.schemeCode, h);
    });
    return map;
  }, [freshCandidates, overallNavQ]);

  // Progress — cached funds count as instantly settled
  const cachedCount    = overallCandidates.length - freshCandidates.length;
  const freshSettled   = useMemo(
    () => overallNavQ.filter((q) => q.status === "success" || q.status === "error").length,
    [overallNavQ],
  );
  const freshLoaded    = useMemo(
    () => overallNavQ.filter((q) => q.status === "success").length,
    [overallNavQ],
  );
  const overallSettled = cachedCount + freshSettled;
  const overallLoaded  = cachedCount + freshLoaded;
  const overallFailed  = (freshSettled - freshLoaded); // settled but no data on mfapi.in
  const overallTotal   = overallCandidates.length;
  const overallDone    = overallSettled === overallTotal && overallTotal > 0;



  // Populate shared fund-store as NAV data arrives so other pages (Rankings,
  // Screener, Fund Detail) can read it instantly via initialData — no re-fetch.
  useEffect(() => {
    for (const [code, h] of freshNavMap) {
      storeSeries(code, h.series);
    }
  }, [freshNavMap]);

  // After all NAV data is loaded, compute 7-pillar EngineMetrics in the
  // background, score each category with scoreWithPeers(), and export results
  // progressively to fund-store. The UI subscribes to fund-store and re-renders
  // as each category becomes available.
  //
  // BUG FIX: previous version returned early if byCategory.size===0 (all in
  // cache), so scores were NEVER exported to fund-store on reload. Fixed: we
  // always iterate ALL categories for scoring even when no computation is needed.
  useEffect(() => {
    if (!overallDone || overallCandidates.length === 0) return;

    const existingCache = loadEngineCache();

    // Funds that need fresh metric computation (not in today's engine-cache)
    const toCompute = new Map<QuantFundCategory, { code: string; series: NavPoint[] }[]>();
    for (const s of overallCandidates) {
      if (existingCache.has(s.schemeCode)) continue;
      const series = freshNavMap.get(s.schemeCode)?.series;
      if (!series?.length) continue;
      let arr = toCompute.get(s.poolCategory);
      if (!arr) { arr = []; toCompute.set(s.poolCategory, arr); }
      arr.push({ code: s.schemeCode, series });
    }

    // Score ALL categories — even when metrics are cached we still need to
    // run scoreWithPeers() so fund-store is populated and the UI shows results.
    const allCats = [...new Set(overallCandidates.map(s => s.poolCategory))];
    let catIdx = 0;

    const processNextCategory = () => {
      if (catIdx >= allCats.length) return;
      const cat = allCats[catIdx++];

      // Step A — Compute engine metrics for any new funds in this category
      const newFunds = toCompute.get(cat) ?? [];
      if (newFunds.length > 0) {
        const allCatSeries = overallCandidates
          .filter(s => s.poolCategory === cat)
          .map(s => freshNavMap.get(s.schemeCode)?.series)
          .filter((s): s is NavPoint[] => !!s && s.length > 0);

        if (allCatSeries.length >= 2) {
          const bm = buildBenchmark(allCatSeries);
          const newEntries = new Map<string, EngineMetrics>();
          for (const { code, series } of newFunds) {
            newEntries.set(code, computeEngineMetrics(series, bm ?? undefined));
          }
          saveEngineCache(newEntries);
        }
      }

      // Step B — Score this full category using all available engine metrics
      const freshCache = loadEngineCache();
      const catSchemes  = overallCandidates.filter(s => s.poolCategory === cat);
      const peers: EngineMetrics[] = [];
      const fundEntries: { scheme: PoolEntry; metrics: EngineMetrics }[] = [];
      for (const s of catSchemes) {
        const m = freshCache.get(s.schemeCode);
        if (m) { peers.push(m); fundEntries.push({ scheme: s, metrics: m }); }
      }

      if (peers.length >= 3) {
        const scored = fundEntries.map(({ scheme, metrics }) => {
          const result = scoreWithPeers(metrics, peers);
          return {
            schemeCode:      scheme.schemeCode,
            schemeName:      scheme.schemeName,
            amc:             scheme.amc,
            nav:             scheme.nav,
            category:        scheme.category,
            poolCategory:    scheme.poolCategory as string,
            fundScore:       result.fundScore,
            finalScore:      result.finalScore,
            confidenceScore: result.confidenceScore,
            rating:          result.rating,
            ratingColor:     result.ratingColor,
            categoryRank:    0,
            metrics,
            pillars:         result.pillars,
          } as RankedFund;
        });
        scored.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
        scored.forEach((f, i) => { f.categoryRank = i + 1; });
        mergeCategoryIntoStore(cat, scored);
      }

      // Yield to the UI thread between categories so Dashboard stays responsive
      setTimeout(processNextCategory, 12);
    };

    // If all metrics are in cache, start immediately; otherwise wait 1 s so
    // the Dashboard finishes its initial render before the CPU-heavy scoring.
    setTimeout(processNextCategory, toCompute.size === 0 ? 0 : 1000);
  }, [overallDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Engine rankings from fund-store ──────────────────────────────────────
  // fund-store is populated progressively by the engine computation useEffect
  // above. We subscribe here so Dashboard re-renders whenever a new category
  // is scored and exported.
  const [allRanked, setAllRankedState] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRankedState(getFullRankedList())), []);

  // Table 1: top 10 across all categories, globally sorted by finalScore
  const overallRanked = useMemo(() => allRanked.slice(0, TOP_N), [allRanked]);

  // ── Category pool ─────────────────────────────────────────────────────────
  // catCandidates: all Direct-Growth funds in the active category
  // catRanked:     top 10 from fund-store for this category (engine scored)
  // Switching categories is INSTANT — no additional network requests needed.

  const catCandidates = useMemo(
    () => overallCandidates.filter((s) => s.poolCategory === activeCategory),
    [overallCandidates, activeCategory],
  );

  const catTotal  = catCandidates.length;
  // Full count of scored funds in this category (not capped to TOP_N).
  // Used for the progress bar and catDone — catRanked is just the display slice.
  const catScoredCount = useMemo(
    () => allRanked.filter(f => f.poolCategory === activeCategory).length,
    [allRanked, activeCategory],
  );
  const catRanked = useMemo(
    () => allRanked.filter(f => f.poolCategory === activeCategory).slice(0, TOP_N),
    [allRanked, activeCategory],
  );
  const catLoaded = catScoredCount;
  const catDone   = catScoredCount > 0 && overallDone;

  // ── KPI strip ────────────────────────────────────────────────────────────
  const topScore    = overallRanked[0]?.finalScore ?? null;
  const topCatScore = catRanked[0]?.finalScore ?? null;
  const universeSize = activeSchemes.length;
  const asOf         = allSchemes?.[0]?.date ?? null;

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

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {universeSize.toLocaleString()} active Growth schemes ·{" "}
              {overallCandidates.length.toLocaleString()} in overall pool ·{" "}
              {OVERALL_POOL_CATEGORIES.length} categories
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="NAV data updates once daily after market close." />
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={Layers}   label="Active schemes"  value={universeSize.toLocaleString()} />
          <KpiTile icon={Activity} label="Pool / scored"
            value={`${overallLoaded.toLocaleString()} / ${overallTotal.toLocaleString()}`}
            sub={`${OVERALL_POOL_CATEGORIES.length} cats`} />
          <KpiTile icon={Star}     label="Top engine score"
            value={topScore != null ? fmtNum(topScore, 1) : "—"} tone="cyan" />
          <KpiTile icon={TrendingUp} label="Top cat. score"
            value={topCatScore != null ? fmtNum(topCatScore, 1) : "—"} tone="cyan" />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABLE 1 — Overall Top 10                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Medal className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Overall Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                Engine Score · All {OVERALL_POOL_CATEGORIES.length} Categories
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Every Direct-Growth scheme across all {OVERALL_POOL_CATEGORIES.length} AMFI fund categories —
              {" "}{overallCandidates.toLocaleString !== undefined
                ? overallCandidates.length.toLocaleString()
                : overallCandidates.length} funds in pool.
              7-pillar institutional scoring: Consistency (23%), Risk-Adjusted (20%), Downside Protection (20%),
              Cost Efficiency (15%), Portfolio Quality (12%), Short-Term (5%), Management (5%).
              <InfoTip text="Each pillar scored as a category-relative percentile within the fund's peer group. Final Score = fundScore × 90% + confidenceScore × 10%. Confidence penalises short-history funds." />
            </p>
          </div>

          {/* Factor weight strip */}
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { label: "LT Consistency", pct: "23%", note: "3Y/5Y/7Y/10Y CAGR + beat rate" },
              { label: "Risk-Adjusted",  pct: "20%", note: "Sortino + Sharpe + IR" },
              { label: "Downside Prot.", pct: "20%", note: "Capture ratios + MaxDD" },
              { label: "Cost Efficiency",pct: "15%", note: "Jensen's α + Tracking Error" },
              { label: "Port. Quality",  pct: "12%", note: "Calmar + Omega + StdDev" },
              { label: "Short-Term",     pct:  "5%", note: "1M/3M/6M returns" },
              { label: "Management",     pct:  "5%", note: "Longevity + Bear Market" },
            ].map((f) => (
              <div key={f.label}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px]">
                <span className="font-mono font-bold text-cyan">{f.pct}</span>
                <span className="text-muted-foreground">{f.label}</span>
                <span className="hidden text-muted-foreground/60 sm:block">· {f.note}</span>
              </div>
            ))}
          </div>

          <ProgressBar
            settled={overallSettled}
            loaded={overallLoaded}
            total={overallTotal}
            noData={overallFailed}
            label={`Overall pool · ${OVERALL_POOL_CATEGORIES.length} categories`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {overallRanked.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Scoring full pool — {overallLoaded}/{overallTotal} loaded…
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
                        Engine Score
                        <InfoTip text="7-pillar institutional score (0–100). Category-relative percentile. Final Score = fundScore×90% + confidenceScore×10%." />
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
                        <tr key={f.schemeCode}
                          className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}>

                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link to="/fund/$id" params={{ id: f.schemeCode }}
                              className="block max-w-[240px] text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                              {f.schemeName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {f.amc}
                            </p>
                          </td>

                          <td className="p-3">
                            <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                              {f.poolCategory}
                            </span>
                          </td>

                          <td className="p-3 text-right">
                            {f.finalScore != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">
                                  {fmtNum(f.finalScore, 1)}
                                </span>
                                <ScoreBar value={f.finalScore} />
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
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.calmarRatio)}`}>
                            {fmtNum(m.calmarRatio, 2)}
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

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {allRanked.length.toLocaleString()} scored · {overallTotal.toLocaleString()} total · top {TOP_N} shown
              </span>
              {overallDone ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-positive">
                  <CheckCircle2 className="h-3 w-3" /> Complete · final ranking
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading — {overallSettled}/{overallTotal}…
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Engine Score is <span className="text-foreground">category-relative</span> — a fund is ranked against its
            direct category peers, not the entire universe. Final Score = fundScore × 90% + confidenceScore × 10%.
            Higher confidence = longer NAV history &amp; more data completeness.
          </p>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABLE 2 — Category Top 10                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <BarChart2 className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Category Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                Engine Score · Direct Growth Only
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Direct-Growth plans only in the selected category, ranked by QuantFund Score. Regular, IDCW and other plan variants are excluded.
            </p>
          </div>

          {/* Category pills — all 34 categories */}
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
            {CAT_TABS.map((cat) => {
              const count = activeSchemes.filter(
                (s) => classifyAMFICategory(s.category) === cat,
              ).length;
              if (count === 0) return null;
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

          <ProgressBar
            settled={catLoaded}
            loaded={catLoaded}
            total={catTotal}
            label={`${activeCategory} · ${catTotal} plans · from overall pool`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {/* Sub-header */}
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
                {activeCategory} · Top {TOP_N}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {catCandidates.length} plans in pool
              </span>
            </div>

            {catCandidates.length === 0 ? (
              <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                No schemes found in {activeCategory}
              </div>
            ) : catRanked.length === 0 && overallLoaded > 0 ? (
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
                        Engine Score
                        <InfoTip text="7-pillar institutional score, category-relative percentile. Final Score = fundScore × 90% + confidence × 10%." />
                      </th>
                      <th className="p-3 text-right font-medium">6M Ret</th>
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
                            <div className="flex max-w-[300px] flex-col gap-0.5">
                              <Link to="/fund/$id" params={{ id: s.schemeCode }}
                                className="text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                                {s.schemeName}
                              </Link>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                                  {s.amc} · ₹{s.nav.toFixed(2)}
                                </span>
                                <span className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider bg-positive/15 text-positive">
                                  Direct Growth
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-right">
                            {s.finalScore != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">
                                  {fmtNum(s.finalScore, 1)}
                                </span>
                                <ScoreBar value={s.finalScore} />
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(s.metrics.ret6m)}`}>
                            {fmtPct(s.metrics.ret6m, { signed: true })}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.metrics.cagr3y)}`}>
                            {fmtPct(s.metrics.cagr3y, { signed: true })}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.metrics.sharpe)}`}>
                            {fmtNum(s.metrics.sharpe, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.metrics.maxDrawdown)}`}>
                            {fmtPct(s.metrics.maxDrawdown, { signed: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {catLoaded}/{catTotal} scored{catDone ? <span className="text-positive ml-1">· final</span> : null}
              </span>
              <Link to="/rankings"
                className="font-mono text-[9px] uppercase tracking-wider text-cyan transition-colors hover:text-cyan/80">
                Full rankings →
              </Link>
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Engine Score</span> is category-relative — each fund is scored against its direct peers.
            Final Score = fundScore × 90% + confidenceScore × 10%. Data:{" "}
            <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer"
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
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
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
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 opacity-70 ${iconClass}`} aria-hidden="true" />
      </div>
      <p className={`font-display text-xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
