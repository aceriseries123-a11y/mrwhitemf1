import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertCircle, Loader2, CheckCircle2, Activity, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes } from "../lib/live-data";
import { classifyAMFICategory, QUANTFUND_CATEGORIES, categoryColor, type QuantFundCategory } from "../lib/categories";
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
      { name: "description", content: "Full-universe fund rankings — all AMFI Direct-Growth schemes, scored with a category-based Fund Score." },
    ],
  }),
  component: DashboardPage,
});

const POOL_CATS = QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[];
const ALL_CATS: Array<"All" | QuantFundCategory> = ["All", ...POOL_CATS];

type PoolEntry = { schemeCode: string; schemeName: string; amc: string; nav: number; date: string; category: string; poolCategory: QuantFundCategory };
type SortKey = "rank" | "schemeName" | "poolCategory" | "finalScore" | "nav" | "aum" | "annualReturnAvg" | "rollingReturn1yAvg";
type SortDir = "asc" | "desc";

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function fmtAUM(cr: number): string {
  if (cr >= 10000) return `₹${(cr / 1000).toFixed(1)}K Cr`;
  if (cr >= 1000)  return `₹${(cr / 1000).toFixed(2)}K Cr`;
  return `₹${fmtNum(cr, 0)} Cr`;
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "22", borderColor: color + "66", color }}
      className="rounded-md border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-cyan transition-all" style={{ width: value != null ? `${Math.min(100, value)}%` : "0%" }} />
    </div>
  );
}

function SortTh({ label, k, sortKey, sortDir, onSort, right = true, title }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; right?: boolean; title?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`p-3 font-medium whitespace-nowrap ${right ? "text-right" : ""}`} title={title}>
      <button onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors ${active ? "text-cyan" : "text-muted-foreground hover:text-foreground"}`}>
        {label}
        {active ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function ProgressBar({ settled, loaded, total }: { settled: number; loaded: number; total: number }) {
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const done = settled === total && total > 0;
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface/60 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {done ? <CheckCircle2 className="h-3 w-3 text-positive" /> : <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
          {loaded.toLocaleString()} scored / {total.toLocaleString()} total
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
  const [catFilter, setCatFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const activeSchemes = useMemo(() => (allSchemes ? filterActiveSchemes(allSchemes) : []), [allSchemes]);

  const candidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];
    return POOL_CATS.flatMap(cat =>
      activeSchemes
        .filter(s => classifyAMFICategory(s.category) === cat && /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName))
        .map(s => ({ ...s, poolCategory: cat }))
    );
  }, [activeSchemes]);

  const cachedRef = useRef(loadEngineCache());
  const fresh = useMemo(() => candidates.filter(s => !cachedRef.current.has(s.schemeCode)), [candidates]);

  const navQ = useQueries({
    queries: fresh.map(s => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const freshNavMap = useMemo(() => {
    const map = new Map<string, NavHistory>();
    fresh.forEach((s, i) => { const h = navQ[i]?.data; if (h) map.set(s.schemeCode, h); });
    return map;
  }, [fresh, navQ]);

  const cachedCount  = candidates.length - fresh.length;
  const freshSettled = useMemo(() => navQ.filter(q => q.status === "success" || q.status === "error").length, [navQ]);
  const freshLoaded  = useMemo(() => navQ.filter(q => q.status === "success").length, [navQ]);
  const totalSettled = cachedCount + freshSettled;
  const totalLoaded  = cachedCount + freshLoaded;
  const totalFunds   = candidates.length;
  const done         = totalSettled === totalFunds && totalFunds > 0;

  useEffect(() => { for (const [code, h] of freshNavMap) storeSeries(code, h.series); }, [freshNavMap]);

  useEffect(() => {
    if (!done || candidates.length === 0) return;
    const cache = loadEngineCache();
    const toCompute = new Map<QuantFundCategory, { code: string; series: NavPoint[] }[]>();
    for (const s of candidates) {
      if (cache.has(s.schemeCode)) continue;
      const series = freshNavMap.get(s.schemeCode)?.series;
      if (!series?.length) continue;
      let arr = toCompute.get(s.poolCategory);
      if (!arr) { arr = []; toCompute.set(s.poolCategory, arr); }
      arr.push({ code: s.schemeCode, series });
    }
    const allCats = [...new Set(candidates.map(s => s.poolCategory))];
    let ci = 0;
    const next = () => {
      if (ci >= allCats.length) return;
      const cat = allCats[ci++];
      const newFunds = toCompute.get(cat) ?? [];
      if (newFunds.length > 0) {
        const allSeries = candidates.filter(s => s.poolCategory === cat).map(s => freshNavMap.get(s.schemeCode)?.series).filter((s): s is NavPoint[] => !!s && s.length > 0);
        if (allSeries.length >= 2) {
          const bm = buildBenchmark(allSeries);
          const entries = new Map<string, EngineMetrics>();
          for (const { code, series } of newFunds) entries.set(code, computeEngineMetrics(series, bm ?? undefined));
          saveEngineCache(entries);
        }
      }
      const freshCache = loadEngineCache();
      const catSchemes = candidates.filter(s => s.poolCategory === cat);
      const peers: EngineMetrics[] = [];
      const items: { scheme: PoolEntry; metrics: EngineMetrics }[] = [];
      for (const s of catSchemes) {
        const m = freshCache.get(s.schemeCode);
        if (m) { peers.push(m); items.push({ scheme: s, metrics: m }); }
      }
      if (peers.length >= 3) {
        const scored = items.map(({ scheme, metrics }) => {
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
      setTimeout(next, 12);
    };
    setTimeout(next, toCompute.size === 0 ? 0 : 800);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  // AUM fetch — fires once after scoring is substantially complete (≥50 ranked funds
  // and no new funds scored in the last 3 seconds). Parallel batches, single setState
  // to avoid React state-race between concurrent updaters.
  const [aumMap, setAumMap] = useState<Map<string, number>>(new Map());
  const aumFetchedRef = useRef(false);
  useEffect(() => {
    if (allRanked.length < 50 || aumFetchedRef.current) return;

    // Debounce: wait 3s of silence (no new funds scoring) before firing
    const timer = setTimeout(async () => {
      if (aumFetchedRef.current) return;
      aumFetchedRef.current = true;

      const codes = allRanked.map(f => f.schemeCode);
      const BATCH = 60;
      const batches: string[][] = [];
      for (let i = 0; i < codes.length; i += BATCH) batches.push(codes.slice(i, i + BATCH));

      // All batches in parallel; collect results into one object, single setState
      const collected: Record<string, number> = {};
      await Promise.all(batches.map(async batch => {
        try {
          const res = await fetch(`/api/public/scheme-aum?codes=${batch.join(",")}`);
          if (!res.ok) return;
          const data = await res.json() as Record<string, number>;
          Object.assign(collected, data);
        } catch { /* best-effort */ }
      }));

      if (Object.keys(collected).length > 0) {
        setAumMap(new Map(Object.entries(collected)));
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [allRanked.length]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const displayed = useMemo(() => {
    let list = allRanked;
    if (catFilter !== "All") list = list.filter(f => f.poolCategory === catFilter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(f => f.schemeName.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q)); }
    return [...list].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortKey === "schemeName") return dir * a.schemeName.localeCompare(b.schemeName);
      if (sortKey === "poolCategory") return dir * (a.poolCategory as string).localeCompare(b.poolCategory as string);
      if (sortKey === "nav") return dir * ((a.nav ?? 0) - (b.nav ?? 0));
      if (sortKey === "aum") return dir * ((aumMap.get(a.schemeCode) ?? -1) - (aumMap.get(b.schemeCode) ?? -1));
      if (sortKey === "annualReturnAvg") return dir * ((a.metrics.annualReturnAvg ?? -999) - (b.metrics.annualReturnAvg ?? -999));
      if (sortKey === "rollingReturn1yAvg") return dir * ((a.metrics.rollingReturn1yAvg ?? -999) - (b.metrics.rollingReturn1yAvg ?? -999));
      return dir * ((a.finalScore ?? -1) - (b.finalScore ?? -1));
    });
  }, [allRanked, catFilter, search, sortKey, sortDir, aumMap]);

  const asOf = allSchemes?.[0]?.date ?? null;

  if (isError) return (
    <AppShell title="Dashboard">
      <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
        <div><p className="font-display text-sm font-semibold uppercase tracking-widest text-negative">Fund data unavailable</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p></div>
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

  const aumLoaded = aumMap.size > 0;

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5"><Activity className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1></div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {totalFunds.toLocaleString()} Direct-Growth funds · Category-Based Fund Score · Category-relative
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf} />
        </div>

        <ProgressBar settled={totalSettled} loaded={totalLoaded} total={totalFunds} />

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fund or AMC…"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none w-64" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value as "All" | QuantFundCategory)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-cyan/60 focus:outline-none">
            {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground">
            {displayed.length.toLocaleString()} shown
            {!done && <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
            {done && <CheckCircle2 className="h-3 w-3 text-positive" />}
          </span>
        </div>

        {/* Methodology strip */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-bold text-cyan">Fund Score</span> — fixed weights, category-relative percentile ranking:
            Performance <span className="text-foreground">40%</span> · Consistency <span className="text-foreground">30%</span> · Risk <span className="text-foreground">20%</span> · Benchmark Skill <span className="text-foreground">10%</span>
            &nbsp;·&nbsp;Portfolio Quality &amp; Manager Quality: <span className="text-muted-foreground italic">Coming Soon</span> (removed from scoring until real data available)
            &nbsp;·&nbsp;<span className="font-bold text-cyan">Avg Cal-Yr Ret</span> = mean of each calendar year's return · <span className="font-bold text-cyan">Rolling 1Y Avg</span> = mean of every rolling 1Y return window
            &nbsp;·&nbsp;<span className="font-bold text-cyan">Fund Size</span> = AUM in ₹ Cr via Kuvera (loaded after scoring)
          </p>
        </div>

        {/* Table */}
        {allRanked.length === 0 && totalLoaded > 0 ? (
          <div className="flex flex-col items-center gap-3 py-16"><Loader2 className="h-5 w-5 animate-spin text-cyan" /><p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Computing engine scores…</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    <th className="w-10 p-3 text-center font-medium">Sno</th>
                    <SortTh label="Fund Name" k="schemeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                    <SortTh label="Category" k="poolCategory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                    <SortTh label="Fund Score" k="finalScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="NAV ₹" k="nav" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Fund Size" k="aum" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="AUM via Kuvera — loaded after scoring completes" />
                    <SortTh label="Avg Cal-Yr Ret" k="annualReturnAvg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Rolling 1Y Avg" k="rollingReturn1yAvg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayed.length === 0 ? (
                    <tr><td colSpan={8} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {allRanked.length === 0 ? "Scoring in progress…" : "No funds match filters"}
                    </td></tr>
                  ) : displayed.map((f, idx) => {
                    const m = f.metrics;
                    const aum = aumMap.get(f.schemeCode);
                    return (
                      <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                        <td className="p-3 text-center font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{String(idx + 1).padStart(2, "0")}</td>
                        <td className="p-3 max-w-[280px]">
                          <Link to="/fund/$id" params={{ id: f.schemeCode }}
                            className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">{f.schemeName}</Link>
                          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                        </td>
                        <td className="p-3"><CategoryBadge cat={f.poolCategory as string} /></td>
                        <td className="p-3 text-right">
                          {f.finalScore != null ? (
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">{fmtNum(f.finalScore, 1)}</span>
                              <ScoreBar value={f.finalScore} />
                              <span className={`font-mono text-[8px] uppercase tracking-wider ${f.ratingColor ?? "text-muted-foreground"}`}>{f.rating}</span>
                            </div>
                          ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">₹{f.nav.toFixed(2)}</td>
                        <td className="p-3 text-right">
                          {aum != null
                            ? <span className="font-mono text-[11px] tabular-nums text-foreground">{fmtAUM(aum)}</span>
                            : <span className="font-mono text-[10px] text-muted-foreground" title={aumLoaded ? "AUM not available for this fund" : "Loading AUM…"}>
                                {aumLoaded ? "—" : <Loader2 className="inline h-3 w-3 animate-spin" />}
                              </span>}
                        </td>
                        <td className="p-3 text-right" title={
                            m.calendarYearReturns?.length
                              ? m.calendarYearReturns.map(r => `${(r * 100 >= 0 ? "+" : "") + (r * 100).toFixed(1)}%`).join(" · ")
                              : "Insufficient history for calendar-year calculation"
                          }>
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className={`font-mono text-[11px] font-bold tabular-nums ${tone(m.annualReturnAvg)}`}>
                              {fmtPct(m.annualReturnAvg, { signed: true })}
                            </span>
                            {m.calendarYearReturns?.length > 0 && (
                              <span className="font-mono text-[8px] text-muted-foreground">
                                {m.calendarYearReturns.length}yr avg
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.rollingReturn1yAvg)}`}>
                          {m.rollingReturn1yAvg != null ? fmtPct(m.rollingReturn1yAvg, { signed: true }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{allRanked.length.toLocaleString()} scored · {totalFunds.toLocaleString()} total · {displayed.length.toLocaleString()} shown</span>
              {done ? <span className="flex items-center gap-1.5 font-mono text-[9px] text-positive"><CheckCircle2 className="h-3 w-3" /> Complete</span>
                : <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {totalSettled}/{totalFunds}…</span>}
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <span className="text-foreground font-semibold">Avg Cal-Yr Ret</span> = arithmetic mean of each calendar year's Jan→Dec simple return. Hover cell to see per-year values.
          <span className="text-foreground font-semibold ml-2">Rolling 1Y Avg</span> = mean of ALL rolling 1-year point-to-point returns (every trading day as endpoint).
          <span className="text-foreground font-semibold ml-2">Fund Size</span> = AUM via Kuvera API (ISIN lookup), loaded after scoring completes.
        </p>
      </div>
    </AppShell>
  );
}
