/**
 * rankings.tsx — All score pillars displayed as separate columns.
 *
 * Category selector in top filter bar (dropdown, no pill buttons).
 * Columns: # · Fund · Category · Quality · Perf. · Risk · Downside ·
 *          Cost · Portfolio · Manager · Explore · Return · Confidence · Final
 *
 * Reads from fund-store (populated by Dashboard).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Trophy, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";
import { computeExploreScore, computeReturnScore } from "@/lib/explore-metrics";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "All Direct-Growth mutual funds ranked — every scoring pillar shown as a separate column." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
  component: Rankings,
});

const ALL_CATEGORIES: Array<"All" | QuantFundCategory> = [
  "All",
  ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey =
  | "schemeName" | "poolCategory" | "qualityScore" | "performanceScore"
  | "riskScore" | "downsideScore" | "costScore" | "portfolioScore"
  | "managerScore" | "exploreScore" | "returnScore" | "confidenceScore" | "finalScore";
type SortDir = "asc" | "desc";

function ScoreCell({ v, highlight }: { v: number | null; highlight?: boolean }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const color = highlight
    ? "text-cyan font-bold"
    : v >= 75 ? "text-positive" : v >= 50 ? "text-foreground" : "text-muted-foreground";
  return <span className={`font-mono text-[11px] tabular-nums ${color}`}>{fmtNum(v, 1)}</span>;
}

function SortTh({
  label, k, sortKey, sortDir, onSort, right = true, minW,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean; minW?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      className={`p-3 font-medium whitespace-nowrap ${right ? "text-right" : ""}`}
      style={minW ? { minWidth: minW } : {}}
    >
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 transition-colors ${active ? "text-cyan" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label}
        {active
          ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Rankings() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  const hasData = allRanked.length > 0;

  const categoryPeersMap = useMemo(() => {
    const map = new Map<string, RankedFund[]>();
    for (const f of allRanked) {
      const arr = map.get(f.poolCategory) ?? [];
      arr.push(f);
      map.set(f.poolCategory, arr);
    }
    return map;
  }, [allRanked]);

  const augmented = useMemo(() => allRanked.map(f => {
    const peers = (categoryPeersMap.get(f.poolCategory) ?? []).map(p => p.metrics);
    const exploreScore = computeExploreScore(f.metrics, peers);
    const { returnScore } = computeReturnScore(f.metrics, peers);
    const p = f.pillars;
    return {
      ...f,
      qualityScore:     p?.longTermConsistency.rawScore    ?? null,
      performanceScore: p?.shortTermPerformance.rawScore   ?? null,
      riskScore:        p?.riskAdjusted.rawScore           ?? null,
      downsideScore:    p?.downsideProtection.rawScore     ?? null,
      costScore:        p?.costEfficiency.rawScore         ?? null,
      portfolioScore:   p?.portfolioQuality.rawScore       ?? null,
      managerScore:     p?.managementAUM.rawScore          ?? null,
      exploreScore,
      returnScore,
    };
  }), [allRanked, categoryPeersMap]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const displayed = useMemo(() => {
    let list = augmented;
    if (categoryFilter !== "All") list = list.filter(f => f.poolCategory === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.schemeName.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortKey === "schemeName") return dir * a.schemeName.localeCompare(b.schemeName);
      if (sortKey === "poolCategory") return dir * (a.poolCategory as string).localeCompare(b.poolCategory as string);
      const va = (a as any)[sortKey] as number | null;
      const vb = (b as any)[sortKey] as number | null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [augmented, categoryFilter, search, sortKey, sortDir]);

  if (!hasData) {
    return (
      <AppShell title="Rankings">
        <div className="mx-auto max-w-xl py-24 text-center">
          <Trophy className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
          <h2 className="font-display text-lg font-bold text-foreground">Fund data not loaded yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Rankings reads from Dashboard. Visit Dashboard first — it downloads and scores all funds.
            Once done, Rankings is instant every time.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-opacity hover:opacity-90"
          >
            Load data on Dashboard →
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-[1600px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Trophy className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Global Rankings</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} funds · All 7 engine pillars + Explore + Return scores
            </p>
          </div>
          <DataSourceBadge />
        </div>

        {/* Column guide */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Score columns (all 0–100, category-relative percentile)</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] text-muted-foreground">
            {[
              ["Quality", "LT Consistency 23%"],
              ["Perf.", "Short-Term 5%"],
              ["Risk", "Risk-Adjusted 20%"],
              ["Downside", "Downside Prot. 20%"],
              ["Cost", "Cost Efficiency 15%"],
              ["Portfolio", "Portfolio Quality 12%"],
              ["Manager", "Management 5%"],
              ["Explore", "Sharpe+Sortino+Alpha+IR+RAR+Capture"],
              ["Return", "ST×30% + LT×70%"],
              ["Confidence", "History depth + completeness"],
              ["Final", "Engine×90% + Confidence×10%"],
            ].map(([k, v]) => (
              <span key={k}><span className="text-foreground">{k}</span> — {v}</span>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fund or AMC…"
              className="w-60 rounded-lg border border-border bg-surface py-2 pl-8 pr-8 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as "All" | QuantFundCategory)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-cyan/60 focus:outline-none"
          >
            {ALL_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c}{c !== "All" ? ` (${allRanked.filter(f => f.poolCategory === c).length})` : ""}
              </option>
            ))}
          </select>
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground">
            {displayed.length.toLocaleString()} funds
          </span>
        </div>

        {/* Wide score table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <SortTh label="Fund" k="schemeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} minW="220px" />
                  <SortTh label="Category" k="poolCategory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                  <SortTh label="Quality" k="qualityScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Perf." k="performanceScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Risk" k="riskScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Downside" k="downsideScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Cost" k="costScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Portfolio" k="portfolioScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Manager" k="managerScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Explore" k="exploreScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Return" k="returnScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Confidence" k="confidenceScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Final Score" k="finalScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      No funds match
                    </td>
                  </tr>
                ) : displayed.map((f, idx) => (
                  <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                    <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="p-3 max-w-[240px]">
                      <Link
                        to="/fund/$id"
                        params={{ id: f.schemeCode }}
                        className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan"
                      >
                        {f.schemeName}
                      </Link>
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                    </td>
                    <td className="p-3">
                      <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        {f.poolCategory}
                      </span>
                    </td>
                    <td className="p-3 text-right"><ScoreCell v={f.qualityScore != null ? Math.round(f.qualityScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.performanceScore != null ? Math.round(f.performanceScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.riskScore != null ? Math.round(f.riskScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.downsideScore != null ? Math.round(f.downsideScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.costScore != null ? Math.round(f.costScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.portfolioScore != null ? Math.round(f.portfolioScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.managerScore != null ? Math.round(f.managerScore) : null} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.exploreScore} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.returnScore} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.confidenceScore} /></td>
                    <td className="p-3 text-right"><ScoreCell v={f.finalScore} highlight /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} of {allRanked.length.toLocaleString()} funds · Scroll right to see all columns
            </span>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          All scores are 0–100, percentile-relative within category. Pillar scores come directly from the 7-pillar engine.
          Explore Score: Sharpe 20%, Sortino 15%, Jensen's Alpha 15%, Info Ratio 15%, Risk-Adj Return 15%, Upside Capture 10%, Downside Capture 10%.
          Return Score = short-term (1W–6M, 30%) + long-term (1Y–7Y, 70%) percentile ranks.
        </p>
      </div>
    </AppShell>
  );
}
