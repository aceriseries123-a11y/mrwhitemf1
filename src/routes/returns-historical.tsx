/**
 * returns-historical.tsx — All Trailing Return Periods
 *
 * Columns: Sno · Fund · Category · Return Score · ST Score · LT Score ·
 *          1D · 1W · 1M · 3M · 6M (Short-Term)
 *          Rolling 1Y Avg · Rolling 3Y Avg · Rolling 5Y Avg · Rolling 7Y Avg (Long-Term)
 *
 * ST Score = 1D(20%) + 1W(20%) + 1M(20%) + 3M(20%) + 6M(20%)
 * LT Score = Rolling 1Y(25%) + Rolling 3Y(25%) + Rolling 5Y(25%) + Rolling 7Y(25%)
 * Return Score = ST × 30% + LT × 70%
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { BarChart3, ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, categoryColor, type QuantFundCategory } from "@/lib/categories";
import { computeReturnScore } from "@/lib/explore-metrics";

export const Route = createFileRoute("/returns-historical")({
  head: () => ({
    meta: [
      { title: "Returns — QuantFund" },
      { name: "description", content: "Historical trailing returns and rolling return averages for all mutual funds." },
    ],
  }),
  component: ReturnsHistorical,
});

const ALL_CATS: Array<"All" | QuantFundCategory> = [
  "All", ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey = "schemeName" | "poolCategory" | "returnScore" | "stScore" | "ltScore"
  | "ret1d" | "ret1w" | "ret1m" | "ret3m" | "ret6m"
  | "roll1y" | "roll3y" | "roll5y" | "roll7y";
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

function RetCell({ v }: { v: number | null }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = v > 0.12 ? "text-positive font-bold" : v > 0 ? "text-positive" : "text-negative";
  return <span className={`font-mono text-[11px] tabular-nums ${color}`}>{fmtPct(v, { signed: true })}</span>;
}

function SortTh({ label, k, sortKey, sortDir, onSort, title: t, accent }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; title?: string; accent?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap" title={t}>
      <button onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors ${active ? "text-cyan" : accent ? "text-foreground/80 hover:text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
        {label}
        {active ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function ScoreChip({ v, accent }: { v: number | null; accent?: boolean }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = accent ? "text-cyan font-bold text-[13px]"
    : v >= 75 ? "text-positive font-semibold" : v >= 50 ? "text-foreground" : "text-muted-foreground";
  return <span className={`font-mono text-[11px] tabular-nums ${color}`}>{fmtNum(v, 1)}</span>;
}

function ReturnsHistorical() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("returnScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  const catPeersMap = useMemo(() => {
    const map = new Map<string, RankedFund[]>();
    for (const f of allRanked) { const a = map.get(f.poolCategory) ?? []; a.push(f); map.set(f.poolCategory, a); }
    return map;
  }, [allRanked]);

  const augmented = useMemo(() => allRanked.map(f => {
    const peers = (catPeersMap.get(f.poolCategory) ?? []).map(p => p.metrics);
    const { returnScore, shortTermScore, longTermScore } = computeReturnScore(f.metrics, peers);
    return { ...f, returnScore, shortTermScore, longTermScore };
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
        if (sortKey === "returnScore") return f.returnScore;
        if (sortKey === "stScore")  return f.shortTermScore;
        if (sortKey === "ltScore")  return f.longTermScore;
        if (sortKey === "ret1d")    return f.metrics.ret1d;
        if (sortKey === "ret1w")    return f.metrics.ret1w;
        if (sortKey === "ret1m")    return f.metrics.ret1m;
        if (sortKey === "ret3m")    return f.metrics.ret3m;
        if (sortKey === "ret6m")    return f.metrics.ret6m;
        if (sortKey === "roll1y")   return f.metrics.rollingReturn1yAvg;
        if (sortKey === "roll3y")   return f.metrics.rollingReturn3yAvg;
        if (sortKey === "roll5y")   return f.metrics.rollingReturn5yAvg;
        if (sortKey === "roll7y")   return f.metrics.rollingReturn7yAvg;
        return null;
      };
      const va = getV(a), vb = getV(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [augmented, catFilter, search, sortKey, sortDir]);

  if (allRanked.length === 0) return (
    <AppShell title="Returns">
      <div className="mx-auto max-w-xl py-24 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
        <h2 className="font-display text-lg font-bold text-foreground">No data yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Returns reads from Dashboard. Visit Dashboard first.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background">Load on Dashboard →</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Returns">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5"><BarChart3 className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Historical Returns</h1></div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} funds · trailing ST (1D→6M) + rolling LT averages (1Y→7Y)
            </p>
          </div>
          <DataSourceBadge />
        </div>

        {/* Legend */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[9px] text-muted-foreground">
            <span><span className="text-cyan font-bold">Return Score</span> = Short-Term(30%) + Long-Term(70%), each percentile-ranked within peer group</span>
            <span><span className="text-foreground">ST Score</span> = 1D(20%) + 1W(20%) + 1M(20%) + 3M(20%) + 6M(20%)</span>
            <span><span className="text-foreground">LT Score</span> = Rolling 1Y(25%) + Rolling 3Y(25%) + Rolling 5Y(25%) + Rolling 7Y(25%)</span>
            <span>Rolling Avg = arithmetic mean of ALL rolling N-year point-to-point returns · "expected return from any random N-year hold"</span>
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
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <th className="p-3 font-medium">Fund</th>
                  <th className="p-3 font-medium">Category</th>
                  <SortTh label="Return Score" k="returnScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} accent title="ST×30%+LT×70% (percentile within peer group)" />
                  <SortTh label="ST Score" k="stScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Short-Term: 1D+1W+1M+3M+6M equal-weighted percentile" />
                  <SortTh label="LT Score" k="ltScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Long-Term: Rolling 1Y/3Y/5Y/7Y avg percentile" />
                  {/* Short-term periods */}
                  <SortTh label="1D" k="ret1d" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="1 day simple return" />
                  <SortTh label="1W" k="ret1w" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="1 week simple return" />
                  <SortTh label="1M" k="ret1m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="1 month simple return" />
                  <SortTh label="3M" k="ret3m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="3 month simple return" />
                  <SortTh label="6M" k="ret6m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="6 month simple return" />
                  {/* Long-term rolling averages */}
                  <SortTh label="Roll 1Y Avg" k="roll1y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Mean of all rolling 1-year point-to-point returns" />
                  <SortTh label="Roll 3Y Avg" k="roll3y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Mean of all rolling 3-year point-to-point returns" />
                  <SortTh label="Roll 5Y Avg" k="roll5y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Mean of all rolling 5-year point-to-point returns" />
                  <SortTh label="Roll 7Y Avg" k="roll7y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Mean of all rolling 7-year point-to-point returns" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr><td colSpan={15} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No funds match</td></tr>
                ) : displayed.map((f, idx) => {
                  const m = f.metrics;
                  return (
                    <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                      <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 max-w-[220px]">
                        <Link to="/fund/$id" params={{ id: f.schemeCode }}
                          className="block text-[12px] font-semibold leading-snug text-foreground hover:text-cyan">{f.schemeName}</Link>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                      </td>
                      <td className="p-3"><CategoryBadge cat={f.poolCategory as string} /></td>
                      <td className="p-3 text-right">
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <ScoreChip v={f.returnScore} accent />
                          <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
                            <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, f.returnScore ?? 0)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right"><ScoreChip v={f.shortTermScore} /></td>
                      <td className="p-3 text-right"><ScoreChip v={f.longTermScore} /></td>
                      <td className="p-3 text-right"><RetCell v={m.ret1d} /></td>
                      <td className="p-3 text-right"><RetCell v={m.ret1w} /></td>
                      <td className="p-3 text-right"><RetCell v={m.ret1m} /></td>
                      <td className="p-3 text-right"><RetCell v={m.ret3m} /></td>
                      <td className="p-3 text-right"><RetCell v={m.ret6m} /></td>
                      <td className="p-3 text-right"><RetCell v={m.rollingReturn1yAvg} /></td>
                      <td className="p-3 text-right"><RetCell v={m.rollingReturn3yAvg} /></td>
                      <td className="p-3 text-right"><RetCell v={m.rollingReturn5yAvg} /></td>
                      <td className="p-3 text-right"><RetCell v={m.rollingReturn7yAvg} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} funds · Scroll right for all periods
            </span>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <span className="text-foreground font-semibold">Rolling Avg</span> = arithmetic mean of ALL rolling N-year point-to-point returns (every trading day as endpoint).
          Positive = investor who held any random N-year period earned on average this much. Requires ≥ 8 valid windows.
        </p>
      </div>
    </AppShell>
  );
}
