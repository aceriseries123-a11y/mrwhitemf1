/**
 * explorer.tsx — Fund Explorer (Ratios & Factors)
 *
 * Columns:  Sno · Fund · Category · Explore Score · Expense Ratio ·
 *           Beta · Std Dev · Alpha · Sharpe · Sortino · Upside Cap ·
 *           Downside Cap · Info Ratio · Risk-Adj Ret
 *
 * Upside Capture: full-green bar column. +1 if ≥ 100% (captured more than benchmark), -1 if < 100%.
 * Downside Capture: full-red bar column. +1 if ≤ 100% (fell less than benchmark), -1 if > 100%.
 * Expense Ratio: fetched from Kuvera via /api/public/scheme-ter.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { BarChart2, ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { fmtNum, fmtPct } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, isScoringDone, type RankedFund } from "@/lib/fund-store";
import { loadAumCache, saveAumCache } from "@/lib/aum-cache";
import { QUANTFUND_CATEGORIES, categoryColor, type QuantFundCategory } from "@/lib/categories";
import { computeExploreScore, computeRiskAdjReturn } from "@/lib/explore-metrics";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Explorer — QuantFund" },
      { name: "description", content: "Fund Explorer — ratio-based quality metrics across all scored funds." },
    ],
  }),
  component: FundExplorer,
});

const ALL_CATS: Array<"All" | QuantFundCategory> = [
  "All", ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey = "schemeName" | "poolCategory" | "exploreScore" | "aum"
  | "beta" | "stdDev" | "jensensAlpha" | "sharpe" | "sortino"
  | "upsideCapture" | "downsideCapture" | "informationRatio" | "riskAdjReturn";
type SortDir = "asc" | "desc";

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "22", borderColor: color + "66", color }}
      className="rounded-md border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

function SortTh({ label, k, sortKey, sortDir, onSort, title: titleAttr, accent }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; title?: string; accent?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap" title={titleAttr}>
      <button onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors ${active ? "text-cyan" : accent ? "text-foreground/80 hover:text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
        {label}
        {active ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function RatioCell({ v, pct, lowerBetter = false }: { v: number | null; pct?: boolean; lowerBetter?: boolean }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = lowerBetter
    ? (v <= 0 ? "text-positive" : v <= 80 ? "text-positive" : v <= 100 ? "text-warning" : "text-negative")
    : (v >= 1 ? "text-positive" : v >= 0 ? "text-foreground" : "text-negative");
  return (
    <span className={`font-mono text-[11px] tabular-nums ${color}`}>
      {pct ? `${v.toFixed(2)}` : fmtNum(v, 2)}
    </span>
  );
}

/**
 * Upside Capture: full-green bar.
 * +1 if v ≥ 100 (captured more than benchmark on up days)
 * -1 if v < 100  (captured less)
 */
function UpCaptureCell({ v }: { v: number | null }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const isGood = v >= 100;
  const flag = isGood ? "+1" : "-1";
  const flagColor = isGood ? "text-positive" : "text-negative";
  // Bar: capped at 150% for display width (100% = full bar means matching benchmark)
  const barWidth = Math.min(100, (v / 150) * 100);
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-[10px] font-bold tabular-nums ${flagColor}`}>{flag}</span>
        <span className="font-mono text-[11px] tabular-nums text-foreground font-semibold">
          +{v.toFixed(1)}%
        </span>
      </div>
      {/* Full-green bar */}
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-positive/15">
        <div
          className="h-full rounded-full bg-positive"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Downside Capture: full-red bar.
 * +1 if v ≤ 100 (fell less than benchmark on down days)
 * -1 if v > 100  (fell more than benchmark)
 */
function DnCaptureCell({ v }: { v: number | null }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const isGood = v <= 100;
  const flag = isGood ? "+1" : "-1";
  const flagColor = isGood ? "text-positive" : "text-negative";
  // Bar: capped at 150%; fill is always red
  const barWidth = Math.min(100, (v / 150) * 100);
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-[10px] font-bold tabular-nums ${flagColor}`}>{flag}</span>
        <span className="font-mono text-[11px] tabular-nums text-foreground font-semibold">
          {v.toFixed(1)}%
        </span>
      </div>
      {/* Full-red bar */}
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-negative/15">
        <div
          className="h-full rounded-full bg-negative"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function ScoreCell({ v }: { v: number | null }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = v >= 75 ? "text-cyan font-bold" : v >= 50 ? "text-foreground font-semibold" : "text-muted-foreground";
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={`font-mono text-[12px] tabular-nums ${color}`}>{fmtNum(v, 1)}</span>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  );
}

function FundExplorer() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("exploreScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  // AUM map — fires once Dashboard's scoring pass is fully complete.
  // Persistent localStorage cache (24h): previously-resolved funds appear
  // instantly; only genuinely-missing funds get fetched, and successes are
  // saved immediately so they survive page reloads and future sessions.
  const [aumMap, setAumMap] = useState<Map<string, number>>(loadAumCache);
  const aumFetchedRef = useRef(false);
  useEffect(() => {
    if (!isScoringDone() || aumFetchedRef.current) return;
    if (allRanked.length === 0) return;
    aumFetchedRef.current = true;

    const cached = loadAumCache();

    const runFetch = async () => {
      const entries = allRanked
        .filter(f => !cached.has(f.schemeCode))
        .map(f => {
          const cands = [f.isin, f.isin2].filter((x): x is string => !!x && x.startsWith("INF"));
          return cands.length ? `${f.schemeCode}:${cands.join("|")}` : null;
        })
        .filter((x): x is string => x != null);

      if (entries.length === 0) return;

      const BATCH = 40;
      const CONCURRENCY = 6;
      const collected: Record<string, number> = {};

      const fetchBatch = async (batch: string[]): Promise<boolean> => {
        try {
          const res = await fetch(`/api/public/scheme-aum?funds=${batch.join(",")}`);
          if (!res.ok) return false;
          const data = await res.json() as Record<string, number>;
          Object.assign(collected, data);
          return true;
        } catch {
          return false;
        }
      };

      const runRound = async (items: string[]): Promise<string[]> => {
        const batches: string[][] = [];
        for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
        const failed: string[][] = [];
        let cursor = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (cursor < batches.length) {
            const batch = batches[cursor++];
            const ok = await fetchBatch(batch);
            if (!ok) failed.push(batch);
            setAumMap(new Map([...cached, ...Object.entries(collected)]));
            saveAumCache(collected);
          }
        });
        await Promise.all(workers);
        return failed.flat();
      };

      let remaining = await runRound(entries);
      const backoffs = [3000, 6000];
      for (const delay of backoffs) {
        if (remaining.length === 0) break;
        await new Promise(r => setTimeout(r, delay));
        remaining = await runRound(remaining);
      }
    };

    runFetch();
  }, [allRanked.length]);

  const catPeersMap = useMemo(() => {
    const map = new Map<string, RankedFund[]>();
    for (const f of allRanked) { const a = map.get(f.poolCategory) ?? []; a.push(f); map.set(f.poolCategory, a); }
    return map;
  }, [allRanked]);

  const augmented = useMemo(() => allRanked.map(f => {
    const peers = (catPeersMap.get(f.poolCategory) ?? []).map(p => p.metrics);
    const exploreScore = computeExploreScore(f.metrics, peers);
    const riskAdjReturn = computeRiskAdjReturn(f.metrics);
    return { ...f, exploreScore, riskAdjReturn };
  }), [allRanked, catPeersMap]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const displayed = useMemo(() => {
    let list = augmented;
    if (catFilter !== "All") list = list.filter(f => f.poolCategory === catFilter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(f => f.schemeName.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q)); }
    return [...list].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortKey === "schemeName") return dir * a.schemeName.localeCompare(b.schemeName);
      if (sortKey === "poolCategory") return dir * (a.poolCategory as string).localeCompare(b.poolCategory as string);
      const getV = (f: typeof a): number | null => {
        if (sortKey === "exploreScore")      return f.exploreScore;
        if (sortKey === "aum")               return aumMap.get(f.schemeCode) ?? null;
        if (sortKey === "beta")              return f.metrics.beta;
        if (sortKey === "stdDev")            return f.metrics.stdDev;
        if (sortKey === "jensensAlpha")      return f.metrics.jensensAlpha;
        if (sortKey === "sharpe")            return f.metrics.sharpe;
        if (sortKey === "sortino")           return f.metrics.sortino;
        if (sortKey === "upsideCapture")     return f.metrics.upsideCapture;
        if (sortKey === "downsideCapture")   return f.metrics.downsideCapture;
        if (sortKey === "informationRatio")  return f.metrics.informationRatio;
        if (sortKey === "riskAdjReturn")     return f.riskAdjReturn;
        return null;
      };
      const va = getV(a), vb = getV(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [augmented, catFilter, search, sortKey, sortDir, aumMap]);

  if (allRanked.length === 0) return (
    <AppShell title="Explorer">
      <div className="mx-auto max-w-xl py-24 text-center">
        <BarChart2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
        <h2 className="font-display text-lg font-bold text-foreground">No data yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Explorer reads from Dashboard. Visit Dashboard first to score all funds.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background transition-opacity hover:opacity-90">
          Load on Dashboard →
        </Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Explorer">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5"><BarChart2 className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Fund Explorer</h1></div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} funds · ratio & risk metrics · category-relative scoring
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" />
        </div>

        {/* Legend */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[9px] text-muted-foreground">
            <span><span className="text-cyan font-bold">Explore Score</span> = Sharpe(20%)+Sortino(15%)+Alpha(15%)+IR(15%)+RAR(15%)+Upside(10%)+Downside(10%)</span>
            <span><span className="text-positive font-bold">↑ Upside Cap</span> · full-green bar · <span className="text-positive">+1</span> if ≥100% (captured more rally than benchmark) · <span className="text-negative">-1</span> if &lt;100%</span>
            <span><span className="text-negative font-bold">↓ Downside Cap</span> · full-red bar · <span className="text-positive">+1</span> if ≤100% (fell less than benchmark) · <span className="text-negative">-1</span> if &gt;100%</span>
            <span><span className="text-foreground">Fund Size</span>: AUM in ₹ Cr fetched via Kuvera — loaded after scoring completes</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fund or AMC…"
              className="w-60 rounded-lg border border-border bg-surface py-2 pl-8 pr-8 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value as "All" | QuantFundCategory)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-cyan/60 focus:outline-none">
            {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground">{displayed.length.toLocaleString()} funds</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">Sno</th>
                  <th className="p-3 font-medium text-muted-foreground">Fund</th>
                  <th className="p-3 font-medium text-muted-foreground">Category</th>
                  <SortTh label="Explore Score" k="exploreScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} accent title="7-component ratio score 0-100 (category-relative)" />
                  <SortTh label="Fund Size" k="aum" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="AUM in ₹ Cr — fetched via Kuvera after scoring" />
                  <SortTh label="Beta" k="beta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Market sensitivity vs category benchmark" />
                  <SortTh label="Std Dev" k="stdDev" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Annualised volatility of daily returns" />
                  <SortTh label="Alpha (J)" k="jensensAlpha" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Jensen's Alpha = fund 3Y CAGR − (RFR + β × (bm−RFR))" />
                  <SortTh label="Sharpe" k="sharpe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="(Return − RFR) / std dev · higher better" />
                  <SortTh label="Sortino" k="sortino" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="(Return − RFR) / downside vol · higher better" />
                  <SortTh label="↑ Upside Cap" k="upsideCapture" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Full-green bar. +1 if ≥100% (fund captured more of the rally). -1 if <100%." />
                  <SortTh label="↓ Downside Cap" k="downsideCapture" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Full-red bar. +1 if ≤100% (fund fell less than benchmark). -1 if >100%." />
                  <SortTh label="Info Ratio" k="informationRatio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Annualised excess return / tracking error" />
                  <SortTh label="Risk-Adj Ret" k="riskAdjReturn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Annual Return Avg / Std Dev · higher better" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr><td colSpan={14} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No funds match</td></tr>
                ) : displayed.map((f, idx) => {
                  const m = f.metrics;
                  return (
                    <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                      <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 max-w-[220px]">
                        <Link to="/fund/$id" params={{ id: f.schemeCode }}
                          className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">{f.schemeName}</Link>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                      </td>
                      <td className="p-3"><CategoryBadge cat={f.poolCategory as string} /></td>
                      <td className="p-3 text-right"><ScoreCell v={f.exploreScore} /></td>
                      {/* Fund Size */}
                      <td className="p-3 text-right">
                        {(() => {
                          const aum = aumMap.get(f.schemeCode);
                          if (aum != null) {
                            return <span className="font-mono text-[11px] tabular-nums text-foreground">{aum >= 10000 ? `₹${(aum/1000).toFixed(1)}K Cr` : aum >= 1000 ? `₹${(aum/1000).toFixed(2)}K Cr` : `₹${aum.toFixed(0)} Cr`}</span>;
                          }
                          const hasIsin = !!(f.isin || f.isin2);
                          return <span className="font-mono text-[10px] text-muted-foreground" title={hasIsin ? "Not found in Kuvera AUM index" : "No ISIN in AMFI data for this scheme"}>—</span>;
                        })()}
                      </td>
                      <td className="p-3 text-right">
                        {m.beta != null ? <span className={`font-mono text-[11px] tabular-nums ${m.beta < 0.8 ? "text-positive" : m.beta < 1.1 ? "text-foreground" : "text-negative"}`}>{fmtNum(m.beta, 2)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {m.stdDev != null ? <span className="font-mono text-[11px] tabular-nums text-foreground">{fmtPct(m.stdDev)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {m.jensensAlpha != null ? <span className={`font-mono text-[11px] tabular-nums font-semibold ${m.jensensAlpha >= 0 ? "text-positive" : "text-negative"}`}>{fmtPct(m.jensensAlpha, { signed: true })}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {m.sharpe != null ? <span className={`font-mono text-[11px] tabular-nums ${m.sharpe >= 1 ? "text-positive" : m.sharpe >= 0 ? "text-foreground" : "text-negative"}`}>{fmtNum(m.sharpe, 2)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {m.sortino != null ? <span className={`font-mono text-[11px] tabular-nums ${m.sortino >= 1.5 ? "text-positive" : m.sortino >= 0 ? "text-foreground" : "text-negative"}`}>{fmtNum(m.sortino, 2)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right"><UpCaptureCell v={m.upsideCapture} /></td>
                      <td className="p-3 text-right"><DnCaptureCell v={m.downsideCapture} /></td>
                      <td className="p-3 text-right">
                        {m.informationRatio != null ? <span className={`font-mono text-[11px] tabular-nums ${m.informationRatio >= 0.5 ? "text-positive" : m.informationRatio >= 0 ? "text-foreground" : "text-negative"}`}>{fmtNum(m.informationRatio, 2)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {f.riskAdjReturn != null ? <span className={`font-mono text-[11px] tabular-nums ${f.riskAdjReturn >= 1 ? "text-positive" : f.riskAdjReturn >= 0 ? "text-foreground" : "text-negative"}`}>{fmtNum(f.riskAdjReturn, 2)}</span>
                          : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {displayed.length.toLocaleString()} funds shown · ↑ Upside Cap (green bar): +1 ≥100%, -1 &lt;100% · ↓ Downside Cap (red bar): +1 ≤100%, -1 &gt;100%
          </div>
        </div>
      </div>
    </AppShell>
  );
}
