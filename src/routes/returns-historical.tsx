/**
 * returns-historical.tsx — Historical Returns page with Return Score.
 *
 * Shows all trailing return periods (1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, 7Y, 10Y)
 * and the Return Score (Short-Term × 30% + Long-Term × 70%).
 *
 * Reads from fund-store (populated by Dashboard).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { BarChart3, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";
import { computeReturnScore } from "@/lib/explore-metrics";

export const Route = createFileRoute("/returns-historical")({
  head: () => ({
    meta: [
      { title: "Returns Historical — QuantFund" },
      { name: "description", content: "All trailing return periods (1W–10Y) for every fund plus the Return Score composite." },
      { property: "og:title", content: "Returns Historical — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/returns-historical" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/returns-historical" }],
  }),
  component: ReturnsHistorical,
});

const ALL_CATEGORIES: Array<"All" | QuantFundCategory> = [
  "All",
  ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey =
  | "schemeName" | "poolCategory" | "returnScore" | "shortTermScore" | "longTermScore"
  | "ret1w" | "ret1m" | "ret3m" | "ret6m" | "ret1y" | "cagr3y" | "cagr5y" | "cagr7y" | "cagr10y";
type SortDir = "asc" | "desc";

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function ScoreCell({ v, color }: { v: number | null; color?: string }) {
  if (v == null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const cls = color ?? (v >= 75 ? "text-positive" : v >= 50 ? "text-foreground" : "text-muted-foreground");
  return <span className={`font-mono text-[11px] tabular-nums font-bold ${cls}`}>{fmtNum(v, 1)}</span>;
}

function SortTh({
  label, k, sortKey, sortDir, onSort, title: titleAttr,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; title?: string;
}) {
  const active = sortKey === k;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap" title={titleAttr}>
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

function ReturnsHistorical() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"All" | QuantFundCategory>("All");
  const [sortKey, setSortKey] = useState<SortKey>("returnScore");
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
    const { shortTermScore, longTermScore, returnScore } = computeReturnScore(f.metrics, peers);
    return { ...f, shortTermScore, longTermScore, returnScore };
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
          case "returnScore":    return r.returnScore;
          case "shortTermScore": return r.shortTermScore;
          case "longTermScore":  return r.longTermScore;
          case "ret1w":  return m.ret1w;
          case "ret1m":  return m.ret1m;
          case "ret3m":  return m.ret3m;
          case "ret6m":  return m.ret6m;
          case "ret1y":  return m.ret1y;
          case "cagr3y": return m.cagr3y;
          case "cagr5y": return m.cagr5y;
          case "cagr7y": return m.cagr7y;
          case "cagr10y": return m.cagr10y;
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
    <AppShell title="Returns Historical">
      <div className="mx-auto max-w-[1700px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Returns Historical</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              All trailing return periods · Return Score (ST×30% + LT×70%) · {hasData ? `${allRanked.length.toLocaleString()} funds` : "Load Dashboard first"}
            </p>
          </div>
          <DataSourceBadge />
        </div>

        {/* Return Score guide */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Return Score methodology (0–100, category-relative)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[9px] text-muted-foreground">
            <div>
              <span className="font-bold text-foreground">Short-Term Score</span>{" "}(×30%):
              <span className="ml-2">1W 25%</span>
              <span className="ml-2">1M 25%</span>
              <span className="ml-2">3M 25%</span>
              <span className="ml-2">6M 25%</span>
            </div>
            <div>
              <span className="font-bold text-foreground">Long-Term Score</span>{" "}(×70%):
              <span className="ml-2">1Y 15%</span>
              <span className="ml-2">3Y 25%</span>
              <span className="ml-2">5Y 30%</span>
              <span className="ml-2">7Y 30%</span>
            </div>
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

        {!hasData && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-warning">Dashboard data required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Visit Dashboard to load fund data. This page is instant after that.{" "}
              <Link to="/dashboard" className="text-cyan underline underline-offset-2">Go to Dashboard →</Link>
            </p>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <SortTh label="Fund" k="schemeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Category" k="poolCategory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Return Score" k="returnScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="ST×30% + LT×70%, category-relative" />
                  <SortTh label="ST Score" k="shortTermScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Short-term score (1W–6M)" />
                  <SortTh label="LT Score" k="longTermScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Long-term score (1Y–7Y)" />
                  <SortTh label="1W" k="ret1w" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="1M" k="ret1m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="3M" k="ret3m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="6M" k="ret6m" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="1Y" k="ret1y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="3Y CAGR" k="cagr3y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="5Y CAGR" k="cagr5y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="7Y CAGR" k="cagr7y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="10Y CAGR" k="cagr10y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
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
                      <td className="p-3 text-right"><ScoreCell v={f.returnScore} color="text-cyan" /></td>
                      <td className="p-3 text-right"><ScoreCell v={f.shortTermScore} /></td>
                      <td className="p-3 text-right"><ScoreCell v={f.longTermScore} /></td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.ret1w)}`}>{fmtPct(m.ret1w, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.ret1m)}`}>{fmtPct(m.ret1m, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.ret3m)}`}>{fmtPct(m.ret3m, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.ret6m)}`}>{fmtPct(m.ret6m, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.ret1y)}`}>{fmtPct(m.ret1y, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr3y)}`}>{fmtPct(m.cagr3y, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr5y)}`}>{fmtPct(m.cagr5y, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr7y)}`}>{fmtPct(m.cagr7y, { signed: true })}</td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr10y)}`}>{fmtPct(m.cagr10y, { signed: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} funds · Scroll right for all return periods
            </span>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          All returns from real NAV history via mfapi.in. CAGR for ≥1Y periods, simple return for shorter periods.
          Return Score = short-term (1W–6M, weight 30%) + long-term (1Y–7Y, weight 70%), all percentile-ranked within category.
          "—" means insufficient history for that period.
        </p>
      </div>
    </AppShell>
  );
}
