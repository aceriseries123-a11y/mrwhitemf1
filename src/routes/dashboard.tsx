/**
 * dashboard.tsx — Phase 1+2 rewrite
 *
 * Single unified fund table (Table 2 removed).
 * Columns: Sno · Fund Name · Category · Score · NAV · Fund Size · Annual Return Avg · Rolling Returns
 * All columns are sortable. Category column supports filter.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, CheckCircle2, Activity, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import {
  classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory,
} from "../lib/categories";
import { fetchNavHistory, type NavHistory, type NavPoint } from "../lib/nav-history";
import { fmtPct, fmtNum } from "../lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import {
  storeSeries, mergeCategoryIntoStore, subscribeToRankedList, getFullRankedList, type RankedFund,
} from "../lib/fund-store";
import {
  computeEngineMetrics, buildBenchmark, scoreWithPeers, type EngineMetrics,
} from "../lib/scoring-engine";
import { saveEngineCache, loadEngineCache } from "../lib/engine-cache";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      { name: "description", content: "Full-universe fund rankings — all AMFI Direct-Growth schemes, scored with a 7-pillar Engine Score." },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

const OVERALL_POOL_CATEGORIES = QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[];
const ALL_CATEGORIES: Array<"All" | QuantFundCategory> = ["All", ...OVERALL_POOL_CATEGORIES];

type PoolEntry = AMFIScheme & { poolCategory: QuantFundCategory };

type SortKey = "rank" | "schemeName" | "poolCategory" | "finalScore" | "nav" | "annualReturnAvg" | "rollingPos1y";
type SortDir = "asc" | "desc";

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-cyan transition-all" style={{ width: value != null ? `${Math.min(100, value)}%` : "0%" }} />
    </div>
  );
}

function SortIcon({ field, sortKey, sortDir }: { field: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== field) return <ChevronsUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
  return sortDir === "desc"
    ? <ChevronDown className="ml-1 inline h-3 w-3 text-cyan" />
    : <ChevronUp className="ml-1 inline h-3 w-3 text-cyan" />;
}

function ProgressBar({ settled, loaded, total, noData }: { settled: number; loaded: number; total: number; noData?: number }) {
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const done = settled === total && total > 0;
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface/60 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {done ? <CheckCircle2 className="h-3 w-3 text-positive" /> : <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
          {loaded.toLocaleString()} scored
          <span className="opacity-60">/ {total.toLocaleString()} total</span>
          {done && noData != null && noData > 0 && <span className="opacity-50">· {noData.toLocaleString()} no data</span>}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-all duration-300 ${done ? "bg-positive" : "bg-cyan"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [categoryFilter, setCategoryFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const activeSchemes = useMemo(() => (allSchemes ? filterActiveSchemes(allSchemes) : []), [allSchemes]);

  const overallCandidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];
    return OVERALL_POOL_CATEGORIES.flatMap(category => {
      const inCat = activeSchemes.filter(s => classifyAMFICategory(s.category) === category);
      const directGrowth = inCat.filter(s => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName));
      return directGrowth.map(s => ({ ...s, poolCategory: category }));
    });
  }, [activeSchemes]);

  const engineCacheOnMount = useRef(loadEngineCache());
  const freshCandidates = useMemo(
    () => overallCandidates.filter(s => !engineCacheOnMount.current.has(s.schemeCode)),
    [overallCandidates],
  );

  const overallNavQ = useQueries({
    queries: freshCandidates.map(s => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const freshNavMap = useMemo(() => {
    const map = new Map<string, NavHistory>();
    freshCandidates.forEach((s, i) => {
      const h = overallNavQ[i]?.data;
      if (h) map.set(s.schemeCode, h);
    });
    return map;
  }, [freshCandidates, overallNavQ]);

  const cachedCount   = overallCandidates.length - freshCandidates.length;
  const freshSettled  = useMemo(() => overallNavQ.filter(q => q.status === "success" || q.status === "error").length, [overallNavQ]);
  const freshLoaded   = useMemo(() => overallNavQ.filter(q => q.status === "success").length, [overallNavQ]);
  const overallSettled = cachedCount + freshSettled;
  const overallLoaded  = cachedCount + freshLoaded;
  const overallFailed  = freshSettled - freshLoaded;
  const overallTotal   = overallCandidates.length;
  const overallDone    = overallSettled === overallTotal && overallTotal > 0;

  useEffect(() => {
    for (const [code, h] of freshNavMap) storeSeries(code, h.series);
  }, [freshNavMap]);

  useEffect(() => {
    if (!overallDone || overallCandidates.length === 0) return;
    const existingCache = loadEngineCache();
    const toCompute = new Map<QuantFundCategory, { code: string; series: NavPoint[] }[]>();
    for (const s of overallCandidates) {
      if (existingCache.has(s.schemeCode)) continue;
      const series = freshNavMap.get(s.schemeCode)?.series;
      if (!series?.length) continue;
      let arr = toCompute.get(s.poolCategory);
      if (!arr) { arr = []; toCompute.set(s.poolCategory, arr); }
      arr.push({ code: s.schemeCode, series });
    }
    const allCats = [...new Set(overallCandidates.map(s => s.poolCategory))];
    let catIdx = 0;
    const processNextCategory = () => {
      if (catIdx >= allCats.length) return;
      const cat = allCats[catIdx++];
      const newFunds = toCompute.get(cat) ?? [];
      if (newFunds.length > 0) {
        const allCatSeries = overallCandidates
          .filter(s => s.poolCategory === cat)
          .map(s => freshNavMap.get(s.schemeCode)?.series)
          .filter((s): s is NavPoint[] => !!s && s.length > 0);
        if (allCatSeries.length >= 2) {
          const bm = buildBenchmark(allCatSeries);
          const newEntries = new Map<string, EngineMetrics>();
          for (const { code, series } of newFunds) newEntries.set(code, computeEngineMetrics(series, bm ?? undefined));
          saveEngineCache(newEntries);
        }
      }
      const freshCache = loadEngineCache();
      const catSchemes = overallCandidates.filter(s => s.poolCategory === cat);
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
            schemeCode: scheme.schemeCode, schemeName: scheme.schemeName,
            amc: scheme.amc, nav: scheme.nav, category: scheme.category,
            poolCategory: scheme.poolCategory as string,
            fundScore: result.fundScore, finalScore: result.finalScore,
            confidenceScore: result.confidenceScore, rating: result.rating,
            ratingColor: result.ratingColor, categoryRank: 0,
            metrics, pillars: result.pillars,
          } as RankedFund;
        });
        scored.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
        scored.forEach((f, i) => { f.categoryRank = i + 1; });
        mergeCategoryIntoStore(cat, scored);
      }
      setTimeout(processNextCategory, 12);
    };
    setTimeout(processNextCategory, toCompute.size === 0 ? 0 : 1000);
  }, [overallDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const displayed = useMemo(() => {
    let list = allRanked;
    if (categoryFilter !== "All") list = list.filter(f => f.poolCategory === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.schemeName.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortKey === "schemeName") return dir * a.schemeName.localeCompare(b.schemeName);
      if (sortKey === "poolCategory") return dir * (a.poolCategory as string).localeCompare(b.poolCategory as string);
      if (sortKey === "nav") return dir * ((a.nav ?? 0) - (b.nav ?? 0));
      if (sortKey === "annualReturnAvg") return dir * ((a.metrics.annualReturnAvg ?? -999) - (b.metrics.annualReturnAvg ?? -999));
      if (sortKey === "rollingPos1y") return dir * ((a.metrics.rollingPos1y ?? -1) - (b.metrics.rollingPos1y ?? -1));
      return dir * ((a.finalScore ?? -1) - (b.finalScore ?? -1));
    });
  }, [allRanked, categoryFilter, search, sortKey, sortDir]);

  const asOf = allSchemes?.[0]?.date ?? null;

  if (isError) return (
    <AppShell title="Dashboard">
      <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-negative">Fund data unavailable</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
        </div>
      </div>
    </AppShell>
  );

  if (isLoading || !allSchemes) return (
    <AppShell title="Dashboard">
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-cyan" />
        <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI universe…</p>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-[1400px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Activity className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {overallTotal.toLocaleString()} Direct-Growth funds · 7-Pillar Engine Score · Category-relative
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf} />
        </div>

        {/* Loading progress */}
        <ProgressBar settled={overallSettled} loaded={overallLoaded} total={overallTotal} noData={overallFailed} />

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search fund or AMC…"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none w-64"
          />
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as "All" | QuantFundCategory)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-cyan/60 focus:outline-none"
          >
            {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground">
            {displayed.length.toLocaleString()} funds shown
            {!overallDone && <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
            {overallDone && <CheckCircle2 className="h-3 w-3 text-positive" />}
          </span>
        </div>

        {/* Score methodology strip */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-bold text-cyan">Engine Score</span> — 7-pillar, category-relative:
            {[
              { l: "LT Consistency", w: "23%" }, { l: "Risk-Adjusted", w: "20%" },
              { l: "Downside Prot.", w: "20%" }, { l: "Cost Efficiency", w: "15%" },
              { l: "Portfolio Quality", w: "12%" }, { l: "Short-Term", w: "5%" },
              { l: "Management", w: "5%" },
            ].map(f => (
              <span key={f.l} className="ml-3 inline-flex items-center gap-1">
                {f.l} <span className="text-foreground">{f.w}</span>
              </span>
            ))}
            &nbsp;· Final = fundScore×90% + confidence×10%
          </p>
        </div>

        {/* Main table */}
        {allRanked.length === 0 && overallLoaded > 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-cyan" />
            <p className="font-mono text-[11px] uppercase tracking-widest">Computing engine scores…</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    <th className="w-10 p-3 text-center font-medium">Sno</th>
                    <th className="p-3 font-medium">
                      <button onClick={() => toggleSort("schemeName")} className="flex items-center hover:text-foreground">
                        Fund Name <SortIcon field="schemeName" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="p-3 font-medium">
                      <button onClick={() => toggleSort("poolCategory")} className="flex items-center hover:text-foreground">
                        Category <SortIcon field="poolCategory" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="p-3 text-right font-medium">
                      <button onClick={() => toggleSort("finalScore")} className="inline-flex items-center hover:text-foreground">
                        Score <SortIcon field="finalScore" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="p-3 text-right font-medium">
                      <button onClick={() => toggleSort("nav")} className="inline-flex items-center hover:text-foreground">
                        NAV <SortIcon field="nav" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="p-3 text-right font-medium whitespace-nowrap">Fund Size</th>
                    <th className="p-3 text-right font-medium whitespace-nowrap">
                      <button onClick={() => toggleSort("annualReturnAvg")} className="inline-flex items-center hover:text-foreground">
                        Annual Avg Ret <SortIcon field="annualReturnAvg" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="p-3 text-right font-medium whitespace-nowrap">
                      <button onClick={() => toggleSort("rollingPos1y")} className="inline-flex items-center hover:text-foreground">
                        Rolling 1Y+ <SortIcon field="rollingPos1y" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                        {allRanked.length === 0 ? "Visit Dashboard — data loads here" : "No funds match filters"}
                      </td>
                    </tr>
                  ) : displayed.map((f, idx) => {
                    const m = f.metrics;
                    const isTop3 = idx < 3 && categoryFilter === "All" && !search;
                    return (
                      <tr key={f.schemeCode} className={`transition-colors hover:bg-cyan/[0.04] ${isTop3 ? "bg-cyan/[0.02]" : ""}`}>
                        <td className="p-3 text-center font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="p-3 max-w-[280px]">
                          <Link to="/fund/$id" params={{ id: f.schemeCode }}
                            className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                            {f.schemeName}
                          </Link>
                          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                        </td>
                        <td className="p-3">
                          <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                            {f.poolCategory}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {f.finalScore != null ? (
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">{fmtNum(f.finalScore, 1)}</span>
                              <ScoreBar value={f.finalScore} />
                              <span className={`font-mono text-[8px] uppercase tracking-wider ${f.ratingColor ?? "text-muted-foreground"}`}>
                                {f.rating}
                              </span>
                            </div>
                          ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">
                          ₹{f.nav.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-[10px] text-muted-foreground">—</td>
                        <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.annualReturnAvg)}`}>
                          {fmtPct(m.annualReturnAvg, { signed: true })}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">
                          {m.rollingPos1y != null ? `${(m.rollingPos1y * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {allRanked.length.toLocaleString()} scored · {overallTotal.toLocaleString()} total · {displayed.length.toLocaleString()} shown
              </span>
              {overallDone
                ? <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-positive"><CheckCircle2 className="h-3 w-3" /> Complete · final ranking</span>
                : <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading — {overallSettled}/{overallTotal}…</span>
              }
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Annual Return Average</span> = average of all available 1-year rolling simple returns.
          <span className="text-foreground ml-2">Rolling 1Y+</span> = % of rolling 1-year windows with positive return.
          Engine Score is category-relative — each fund is scored against direct category peers.
          Data: <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI India</a>{" "}&{" "}
          <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
        </p>
      </div>
    </AppShell>
  );
}
