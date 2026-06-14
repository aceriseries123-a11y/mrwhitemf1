/**
 * screener.tsx — 15-filter fund screener powered by fund-store.
 *
 * Reads from fund-store (populated by Dashboard) for instant filtering.
 * Filters: Category · Final Score · Quality · Risk · Confidence ·
 *          1Y Ret · 3Y CAGR · 5Y CAGR · Annual Ret Avg · Max Drawdown ·
 *          Sharpe · Sortino · Calmar · Max Std Dev · Min History Years
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Filter, X, CheckCircle2, SlidersHorizontal, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — QuantFund" },
      { name: "description", content: "Multi-criteria mutual fund screener with 15 filters across returns, risk, ratios and scores." },
      { property: "og:title", content: "Screener — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/screener" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/screener" }],
  }),
  component: Screener,
});

interface Filters {
  category: "All" | QuantFundCategory;
  minFinalScore: number;
  minQualityScore: number;
  minRiskScore: number;
  minConfidence: number;
  min1y: number;
  min3y: number;
  min5y: number;
  maxDD: number;
  minSharpe: number;
  minSortino: number;
  minCalmar: number;
  minAnnualAvg: number;
  maxStdDev: number;
  minHistoryYears: number;
}

const DEFAULT: Filters = {
  category: "All",
  minFinalScore: 0,
  minQualityScore: 0,
  minRiskScore: 0,
  minConfidence: 0,
  min1y: -100,
  min3y: -100,
  min5y: -100,
  maxDD: -100,
  minSharpe: -10,
  minSortino: -10,
  minCalmar: -10,
  minAnnualAvg: -100,
  maxStdDev: 200,
  minHistoryYears: 0,
};

const ALL_CATEGORIES: Array<"All" | QuantFundCategory> = [
  "All",
  ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

type SortKey =
  | "finalScore" | "annualReturnAvg" | "cagr3y" | "cagr5y"
  | "sharpe" | "sortino" | "maxDrawdown" | "calmarRatio" | "confidenceScore";
type SortDir = "asc" | "desc";

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function SortTh({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap">
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

function FilterSlider({
  label, value, min, max, step, display, onChange, tooltip,
}: {
  label: string; value: number; min: number; max: number; step: number;
  display: (v: number) => string; onChange: (v: number) => void; tooltip?: string;
}) {
  return (
    <div title={tooltip}>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
        <span className="font-mono text-[10px] font-bold text-cyan">{display(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-cyan" />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{display(min)}</span>
        <span>{display(max)}</span>
      </div>
    </div>
  );
}

function Screener() {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  const hasData = allRanked.length > 0;

  const sf = <K extends keyof Filters>(k: K) => (v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v }));

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const getVal = (f: RankedFund, k: SortKey): number | null => {
    const m = f.metrics;
    switch (k) {
      case "finalScore":      return f.finalScore;
      case "confidenceScore": return f.confidenceScore;
      case "annualReturnAvg": return m.annualReturnAvg;
      case "cagr3y":          return m.cagr3y;
      case "cagr5y":          return m.cagr5y;
      case "sharpe":          return m.sharpe;
      case "sortino":         return m.sortino;
      case "maxDrawdown":     return m.maxDrawdown;
      case "calmarRatio":     return m.calmarRatio;
      default:                return null;
    }
  };

  const filtered = useMemo(() => {
    if (!hasData) return [];
    const fi = filters;
    return allRanked.filter(f => {
      if (fi.category !== "All" && f.poolCategory !== fi.category) return false;
      if (f.finalScore != null && f.finalScore < fi.minFinalScore) return false;
      const qScore = f.pillars?.longTermConsistency.rawScore;
      if (qScore != null && qScore < fi.minQualityScore) return false;
      const rScore = f.pillars?.riskAdjusted.rawScore;
      if (rScore != null && rScore < fi.minRiskScore) return false;
      if (f.confidenceScore != null && f.confidenceScore < fi.minConfidence) return false;
      const m = f.metrics;
      if (m.ret1y != null && m.ret1y * 100 < fi.min1y) return false;
      if (m.cagr3y != null && m.cagr3y * 100 < fi.min3y) return false;
      if (m.cagr5y != null && m.cagr5y * 100 < fi.min5y) return false;
      if (m.maxDrawdown != null && m.maxDrawdown * 100 < fi.maxDD) return false;
      if (m.sharpe != null && m.sharpe < fi.minSharpe) return false;
      if (m.sortino != null && m.sortino < fi.minSortino) return false;
      if (m.calmarRatio != null && m.calmarRatio < fi.minCalmar) return false;
      if (m.annualReturnAvg != null && m.annualReturnAvg * 100 < fi.minAnnualAvg) return false;
      if (m.stdDev != null && m.stdDev * 100 > fi.maxStdDev) return false;
      if (m.historyYears < fi.minHistoryYears) return false;
      return true;
    });
  }, [allRanked, filters, hasData]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      const va = getVal(a, sortKey);
      const vb = getVal(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return dir * (va - vb);
    });
  }, [filtered, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = Object.entries(filters).filter(([k, v]) => (DEFAULT as any)[k] !== v).length;

  return (
    <AppShell title="Screener">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Screener</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              15 filters · Score pillars · Returns · Risk ratios · Instant from Dashboard data
            </p>
          </div>
          <DataSourceBadge />
        </div>

        {/* No-data notice */}
        {!hasData && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-warning">Dashboard data required</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Visit Dashboard to load fund scores. Screener is instant after that.{" "}
                <Link to="/dashboard" className="text-cyan underline underline-offset-2">Go to Dashboard →</Link>
              </p>
            </div>
          </div>
        )}

        {/* 15-filter panel */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">15 Filters</span>
            {filtersActive && (
              <button
                onClick={() => setFilters(DEFAULT)}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" /> Reset all
              </button>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Category */}
            <div>
              <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Category</label>
              <select
                value={filters.category}
                onChange={e => sf("category")(e.target.value as "All" | QuantFundCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-cyan"
              >
                {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <FilterSlider label="Min Final Score" value={filters.minFinalScore} min={0} max={95} step={5}
              display={v => v.toFixed(0)} onChange={sf("minFinalScore") as (v: number) => void}
              tooltip="Overall Engine Score × 90% + Confidence × 10%" />
            <FilterSlider label="Min Quality Score" value={filters.minQualityScore} min={0} max={95} step={5}
              display={v => v.toFixed(0)} onChange={sf("minQualityScore") as (v: number) => void}
              tooltip="LT Consistency pillar (23% weight)" />
            <FilterSlider label="Min Risk Score" value={filters.minRiskScore} min={0} max={95} step={5}
              display={v => v.toFixed(0)} onChange={sf("minRiskScore") as (v: number) => void}
              tooltip="Risk-Adjusted pillar (20% weight)" />
            <FilterSlider label="Min Confidence" value={filters.minConfidence} min={0} max={95} step={5}
              display={v => v.toFixed(0)} onChange={sf("minConfidence") as (v: number) => void}
              tooltip="History depth (70%) + data completeness (30%)" />
            <FilterSlider label="Min 1Y Return (%)" value={filters.min1y} min={-30} max={60} step={5}
              display={v => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"} onChange={sf("min1y") as (v: number) => void} />
            <FilterSlider label="Min 3Y CAGR (%)" value={filters.min3y} min={-20} max={40} step={5}
              display={v => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"} onChange={sf("min3y") as (v: number) => void} />
            <FilterSlider label="Min 5Y CAGR (%)" value={filters.min5y} min={-20} max={40} step={5}
              display={v => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"} onChange={sf("min5y") as (v: number) => void} />
            <FilterSlider label="Min Annual Ret Avg (%)" value={filters.minAnnualAvg} min={-20} max={50} step={5}
              display={v => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"} onChange={sf("minAnnualAvg") as (v: number) => void}
              tooltip="Average of all rolling 1-year returns" />
            <FilterSlider label="Max Drawdown floor (%)" value={filters.maxDD} min={-80} max={0} step={5}
              display={v => v.toFixed(0) + "%"} onChange={sf("maxDD") as (v: number) => void}
              tooltip="Max peak-to-trough loss (more negative = more lenient)" />
            <FilterSlider label="Min Sharpe Ratio" value={filters.minSharpe} min={-2} max={3} step={0.25}
              display={v => v.toFixed(2)} onChange={sf("minSharpe") as (v: number) => void} />
            <FilterSlider label="Min Sortino Ratio" value={filters.minSortino} min={-2} max={4} step={0.25}
              display={v => v.toFixed(2)} onChange={sf("minSortino") as (v: number) => void} />
            <FilterSlider label="Min Calmar Ratio" value={filters.minCalmar} min={-2} max={3} step={0.25}
              display={v => v.toFixed(2)} onChange={sf("minCalmar") as (v: number) => void}
              tooltip="3Y CAGR / |Max Drawdown|" />
            <FilterSlider label="Max Std Dev (%)" value={filters.maxStdDev} min={5} max={100} step={5}
              display={v => v.toFixed(0) + "%"} onChange={sf("maxStdDev") as (v: number) => void}
              tooltip="Annualised daily return volatility" />
            <FilterSlider label="Min History (years)" value={filters.minHistoryYears} min={0} max={15} step={1}
              display={v => v.toFixed(0) + "y"} onChange={sf("minHistoryYears") as (v: number) => void} />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {hasData ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-positive" />
                <span className="text-foreground">{sorted.length}</span>
                <span>of {allRanked.length.toLocaleString()} funds pass filters</span>
              </>
            ) : (
              <span>No data — visit Dashboard first</span>
            )}
          </div>
          {filtersActive && (
            <span className="rounded-lg border border-cyan/40 bg-cyan/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan">
              {activeCount} filter{activeCount !== 1 ? "s" : ""} active
            </span>
          )}
        </div>

        {/* Results table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="w-10 p-3 text-center font-medium">#</th>
                  <th className="p-3 font-medium">Scheme</th>
                  <th className="p-3 font-medium">Category</th>
                  <SortTh label="Final Score" k="finalScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Confidence" k="confidenceScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Ann Ret Avg" k="annualReturnAvg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="3Y CAGR" k="cagr3y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="5Y CAGR" k="cagr5y" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Sharpe" k="sharpe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Sortino" k="sortino" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Max DD" k="maxDrawdown" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Calmar" k="calmarRatio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <div className="flex flex-col items-center gap-3 py-16 text-center">
                        <Filter className="h-6 w-6 text-muted-foreground opacity-40" />
                        <p className="text-sm text-muted-foreground">
                          {hasData ? "No funds pass the current filters." : "No data — visit Dashboard first."}
                        </p>
                        {hasData && filtersActive && (
                          <button onClick={() => setFilters(DEFAULT)}
                            className="rounded-lg border border-border bg-surface px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                            Reset filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : sorted.map((f, idx) => {
                  const m = f.metrics;
                  return (
                    <tr key={f.schemeCode} className="group transition-colors hover:bg-cyan/[0.04]">
                      <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 max-w-[240px]">
                        <Link to="/fund/$id" params={{ id: f.schemeCode }}
                          className="block text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                          {f.schemeName}
                        </Link>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          {f.amc} · NAV ₹{f.nav.toFixed(2)}
                        </p>
                      </td>
                      <td className="p-3">
                        <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                          {f.poolCategory}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {f.finalScore != null ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">{fmtNum(f.finalScore, 1)}</span>
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-border">
                              <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, f.finalScore)}%` }} />
                            </div>
                          </div>
                        ) : <span className="font-mono text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {f.confidenceScore != null ? fmtNum(f.confidenceScore, 0) : "—"}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.annualReturnAvg)}`}>
                        {fmtPct(m.annualReturnAvg, { signed: true })}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr3y)}`}>
                        {fmtPct(m.cagr3y, { signed: true })}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.cagr5y)}`}>
                        {fmtPct(m.cagr5y, { signed: true })}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sharpe)}`}>
                        {fmtNum(m.sharpe, 2)}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sortino)}`}>
                        {fmtNum(m.sortino, 2)}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.maxDrawdown)}`}>
                        {fmtPct(m.maxDrawdown, { signed: true })}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.calmarRatio)}`}>
                        {fmtNum(m.calmarRatio, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Screener reads from Dashboard data — instant with no extra fetches. All 15 filters apply client-side.
          Funds without sufficient NAV history return null for some metrics and pass those filters by default.
          Data: <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}& <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
        </p>
      </div>
    </AppShell>
  );
}
