/**
 * explorer.tsx — Fund Explorer with all ratio columns + Explore Score.
 *
 * Columns: # · Fund · Category · Explore Score · NAV · Fund Size ·
 *          Annual Ret Avg · Beta · Std Dev · Alpha · Sharpe · Sortino ·
 *          Upside Cap · Downside Cap · Info Ratio · Risk Adj Ret
 *
 * Reads from fund-store (populated by Dashboard).
 * Falls back to AMFI scheme list (NAV only) if Dashboard hasn't run yet.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState, useEffect } from "react";
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown, DatabaseZap } from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";
import { computeExploreScore, computeRiskAdjReturn } from "@/lib/explore-metrics";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Fund Explorer — QuantFund" },
      { name: "description", content: "Explore Indian mutual funds by all key ratios — Sharpe, Sortino, Alpha, Information Ratio, capture ratios and the Explore Score." },
      { property: "og:title", content: "Fund Explorer — QuantFund" },
      { property: "og:description", content: "Full-ratio fund explorer with category-relative Explore Score." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/explorer" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/explorer" }],
  }),
  component: Explorer,
});

const ALL_CATEGORIES: Array<"All" | QuantFundCategory> = [
  "All",
  ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey =
  | "schemeName" | "poolCategory" | "exploreScore" | "nav" | "annualReturnAvg"
  | "beta" | "stdDev" | "jensensAlpha" | "sharpe" | "sortino"
  | "upsideCapture" | "downsideCapture" | "informationRatio" | "riskAdjReturn";
type SortDir = "asc" | "desc";

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function SortTh({
  label, k, sortKey, sortDir, onSort, right = true, title: titleAttr,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean; title?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`p-3 font-medium whitespace-nowrap ${right ? "text-right" : ""}`} title={titleAttr}>
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

function Explorer() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("exploreScore");
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

  const rows = useMemo(() => allRanked.map(f => {
    const peers = (categoryPeersMap.get(f.poolCategory) ?? []).map(p => p.metrics);
    const exploreScore = computeExploreScore(f.metrics, peers);
    const riskAdjReturn = computeRiskAdjReturn(f.metrics);
    return { ...f, exploreScore, riskAdjReturn };
  }), [allRanked, categoryPeersMap]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const displayed = useMemo(() => {
    let list = rows;
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
      const getVal = (r: typeof a): number | null => {
        const m = r.metrics;
        switch (sortKey) {
          case "exploreScore":    return r.exploreScore;
          case "nav":             return r.nav;
          case "annualReturnAvg": return m.annualReturnAvg;
          case "beta":            return m.beta;
          case "stdDev":          return m.stdDev;
          case "jensensAlpha":    return m.jensensAlpha;
          case "sharpe":          return m.sharpe;
          case "sortino":         return m.sortino;
          case "upsideCapture":   return m.upsideCapture;
          case "downsideCapture": return m.downsideCapture;
          case "informationRatio":return m.informationRatio;
          case "riskAdjReturn":   return r.riskAdjReturn;
          default: return null;
        }
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [rows, categoryFilter, search, sortKey, sortDir]);

  return (
    <AppShell title="Fund Explorer">
      <div className="mx-auto max-w-[1800px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Search className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Fund Explorer</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              All ratios · Explore Score · Category-relative · {hasData ? `${allRanked.length.toLocaleString()} funds` : "Load Dashboard first"}
            </p>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex items-start gap-2 rounded-xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3 text-xs text-muted-foreground">
          <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
          <div>
            <span className="font-bold text-foreground">Explore Score</span> = category-relative composite of Sharpe 20% · Sortino 15% · Jensen's Alpha 15% · Info Ratio 15% · Risk-Adj Return 15% · Upside Capture 10% · Downside Capture 10%.
            {" "}All ratio cells show actual values (not percentiles). Percentile ranking happens only inside the Explore Score.
            {!hasData && <span className="ml-2 text-warning"> Visit Dashboard to load fund data.</span>}
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

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1800px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <SortTh label="Fund" k="schemeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                  <SortTh label="Category" k="poolCategory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right={false} />
                  <SortTh label="Explore Score" k="exploreScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="7-component ratio score, category-relative (0–100)" />
                  <SortTh label="NAV ₹" k="nav" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Latest NAV from AMFI" />
                  <th className="p-3 text-right font-medium whitespace-nowrap text-muted-foreground">Fund Size</th>
                  <SortTh label="Ann Ret Avg" k="annualReturnAvg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Average of all 1-year rolling returns" />
                  <SortTh label="Beta" k="beta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Sensitivity to category benchmark" />
                  <SortTh label="Std Dev" k="stdDev" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Annualised daily return volatility" />
                  <SortTh label="Alpha" k="jensensAlpha" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Jensen's Alpha — beta-adjusted excess return" />
                  <SortTh label="Sharpe" k="sharpe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="(Return - RFR) / Std Dev" />
                  <SortTh label="Sortino" k="sortino" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="(Return - RFR) / Downside Std Dev" />
                  <SortTh label="Upside Cap" k="upsideCapture" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="% of benchmark upside captured" />
                  <SortTh label="Downside Cap" k="downsideCapture" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="% of benchmark downside captured (lower=better)" />
                  <SortTh label="Info Ratio" k="informationRatio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Excess return / Tracking Error" />
                  <SortTh label="Risk Adj Ret" k="riskAdjReturn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Annual Return Avg / Std Dev" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {hasData ? "No funds match" : "Visit Dashboard first to load fund data"}
                    </td>
                  </tr>
                ) : displayed.map((f, idx) => {
                  const m = f.metrics;
                  return (
                    <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                      <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 max-w-[220px]">
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
                      {/* Explore Score */}
                      <td className="p-3 text-right">
                        {f.exploreScore != null ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">{fmtNum(f.exploreScore, 1)}</span>
                            <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
                              <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, f.exploreScore)}%` }} />
                            </div>
                          </div>
                        ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">₹{f.nav.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-[10px] text-muted-foreground">—</td>
                      <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.annualReturnAvg)}`}>
                        {fmtPct(m.annualReturnAvg, { signed: true })}
                      </td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">{fmtNum(m.beta, 2)}</td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">{fmtNum(m.stdDev, 4)}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.jensensAlpha)}`}>{fmtNum(m.jensensAlpha, 4)}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sharpe)}`}>{fmtNum(m.sharpe, 2)}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sortino)}`}>{fmtNum(m.sortino, 2)}</td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">{fmtPct(m.upsideCapture)}</td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">{fmtPct(m.downsideCapture)}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.informationRatio)}`}>{fmtNum(m.informationRatio, 2)}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(f.riskAdjReturn)}`}>{fmtNum(f.riskAdjReturn, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} funds · Scroll right for all ratio columns
            </span>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          All metrics computed from real NAV history via mfapi.in · Ann Ret Avg = average of rolling 1Y simple returns ·
          Beta and capture ratios require benchmark data (category average NAV series) ·
          Risk Adj Ret = Ann Ret Avg ÷ Std Dev · Explore Score requires at least Sharpe Ratio data.
        </p>
      </div>
    </AppShell>
  );
}
