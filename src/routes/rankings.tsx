/**
 * rankings.tsx — Composite Ranking Score
 *
 * Ranking Score = Fund Score (50%) + Return Score (30%) + Explore Score (20%)
 *
 * Columns: Sno · Fund · Category · Ranking Score · Fund Score · Return Score · Explore Score
 * All columns sortable · Category dropdown filter · Color-coded category badges
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Trophy, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, categoryColor, type QuantFundCategory } from "@/lib/categories";
import { computeExploreScore, computeReturnScore, computeRankingScore } from "@/lib/explore-metrics";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "Composite ranking across Fund Score, Return Score, and Explore Score." },
    ],
  }),
  component: Rankings,
});

const ALL_CATS: Array<"All" | QuantFundCategory> = [
  "All", ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey = "schemeName" | "poolCategory" | "rankingScore" | "engineScore" | "returnScore" | "exploreScore";
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

function ScoreCell({ v, highlight, neutral }: { v: number | null; highlight?: boolean; neutral?: boolean }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = highlight ? "text-cyan font-bold text-[13px]"
    : neutral ? "text-foreground font-semibold"
    : v >= 75 ? "text-positive" : v >= 50 ? "text-foreground" : "text-muted-foreground";
  return <span className={`font-mono text-[11px] tabular-nums ${color}`}>{fmtNum(v, 1)}</span>;
}

function SortTh({ label, k, sortKey, sortDir, onSort, right = true, title: titleAttr, accent }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean; title?: string; accent?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className={`p-3 font-medium whitespace-nowrap ${right ? "text-right" : ""}`} title={titleAttr}>
      <button onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors ${active ? "text-cyan" : accent ? "text-foreground/70 hover:text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
        {label}
        {active ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Rankings() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("rankingScore");
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
    const exploreScore = computeExploreScore(f.metrics, peers);
    const { returnScore } = computeReturnScore(f.metrics, peers);
    const rankingScore = computeRankingScore(f.finalScore, returnScore, exploreScore);
    return {
      ...f,
      rankingScore,
      engineScore:  f.finalScore,
      returnScore,
      exploreScore,
    };
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
      const va = (a as any)[sortKey] as number | null;
      const vb = (b as any)[sortKey] as number | null;
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [augmented, catFilter, search, sortKey, sortDir]);

  if (allRanked.length === 0) return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-xl py-24 text-center">
        <Trophy className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
        <h2 className="font-display text-lg font-bold text-foreground">Data not loaded yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Rankings reads from Dashboard. Visit Dashboard first to score all funds.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background transition-opacity hover:opacity-90">
          Load data on Dashboard →
        </Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5"><Trophy className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Global Rankings</h1></div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} funds · Ranking Score = Engine(50%) + Return(30%) + Explore(20%)
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" />
        </div>

        {/* Score key */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-cyan font-bold">Composite Ranking Score (0–100)</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] text-muted-foreground">
            <span><span className="text-foreground">Ranking Score</span> = Fund 50% + Return 30% + Explore 20%</span>
            <span><span className="text-foreground">Fund Score</span> = category-based weighted blend of Risk(30%) + Performance(25%) + Consistency(20%) + Benchmark Skill(10%), redistributed across Portfolio/Manager Quality (Data Not Available)</span>
            <span><span className="text-foreground">Return Score</span> = ST(1D+1W+1M+3M+6M) × 30% + LT(Rolling 1Y/3Y/5Y/7Y) × 70%</span>
            <span><span className="text-foreground">Explore Score</span> = Sharpe 20% + Sortino 15% + Alpha 15% + IR 15% + RAR 15% + Captures 20%</span>
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
            {ALL_CATS.map(c => <option key={c} value={c}>{c}{c !== "All" ? ` (${allRanked.filter(f => f.poolCategory === c).length})` : ""}</option>)}
          </select>
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground">{displayed.length.toLocaleString()} funds</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <SortTh label="Fund" k="schemeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                  <SortTh label="Category" k="poolCategory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                  <SortTh label="Ranking Score" k="rankingScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} accent title="Fund(50%)+Return(30%)+Explore(20%)" />
                  <SortTh label="Fund Score" k="engineScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Category-based Fund Score (Risk/Performance/Consistency/Benchmark Skill)" />
                  <SortTh label="Return" k="returnScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="ST×30%+LT×70% rolling returns" />
                  <SortTh label="Explore" k="exploreScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Ratio-based: Sharpe/Sortino/Alpha/IR/RAR/Captures" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No funds match</td></tr>
                ) : displayed.map((f, idx) => (
                  <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                    <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="p-3 max-w-[280px]">
                      <Link to="/fund/$id" params={{ id: f.schemeCode }}
                        className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">{f.schemeName}</Link>
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                    </td>
                    <td className="p-3"><CategoryBadge cat={f.poolCategory as string} /></td>
                    <td className="p-3 text-right">
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <ScoreCell v={f.rankingScore} highlight />
                        <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, f.rankingScore ?? 0)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right"><ScoreCell v={f.engineScore} neutral /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.returnScore} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.exploreScore} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} of {allRanked.length.toLocaleString()} funds
            </span>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Ranking Score</span> = Fund Score × 50% + Return Score × 30% + Explore Score × 20%.
          All sub-scores are 0–100 percentile-relative within category peers.
          Fund Score = category-based weighted blend (Risk, Performance, Consistency, Benchmark Skill) — see Methodology for the full breakdown.
        </p>
      </div>
    </AppShell>
  );
}
