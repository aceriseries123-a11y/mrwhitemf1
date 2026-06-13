/**
 * screener.tsx — Threshold-based fund screener.
 *
 * Pick a category → the top 25 Direct-Growth schemes load and their metrics
 * are computed from real NAV history. Apply numeric threshold filters
 * (min score, min return, max drawdown, min Sharpe) client-side.
 *
 * Note: Metric-based filtering requires per-fund NAV history (mfapi.in).
 * The screener loads a representative set per category rather than the
 * entire AMFI universe to keep fetch counts reasonable.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertCircle, Loader2, Filter, X } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import {
  classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory,
} from "@/lib/categories";
import { fetchNavHistory } from "@/lib/nav-history";
import { computeFundMetrics, quantFundScore } from "@/lib/fund-metrics";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — QuantFund" },
      { name: "description", content: "Filter Indian mutual funds by Sharpe ratio, CAGR, maximum drawdown and the QuantFund Score across the full AMFI universe." },
      { property: "og:title", content: "Screener — QuantFund" },
      { property: "og:description", content: "Multi-metric mutual fund screener with percentile filters." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/screener" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/screener" }],
  }),
  component: Screener,
});

const TOP_N = 25;

interface Filters {
  minScore: number;
  min1y: number;
  min3y: number;
  maxDD: number;
  minSharpe: number;
}

const DEFAULT_FILTERS: Filters = {
  minScore: 0,
  min1y: -100,
  min3y: -100,
  maxDD: -100,
  minSharpe: -10,
};

type Row = AMFIScheme & {
  score: number | null; ret1y: number | null; cagr3y: number | null;
  sharpe: number | null; maxDD: number | null; loaded: boolean;
};

function Screener() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [selectedCategory, setSelectedCategory] = useState<QuantFundCategory>("Large Cap");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<keyof Row>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  const candidates = useMemo(() => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === selectedCategory,
    );
    const direct = inCat.filter((s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName));
    const pool = direct.length >= 10 ? direct : inCat;
    return pool.slice(0, TOP_N);
  }, [activeSchemes, selectedCategory]);

  const navQueries = useQueries({
    queries: candidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const navLoaded = navQueries.filter((q) => q.data).length;
  const navTotal = navQueries.length;

  const rows: Row[] = useMemo(() => {
    return candidates.map((s, i) => {
      const history = navQueries[i]?.data;
      if (!history) {
        return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null, loaded: false };
      }
      const m = computeFundMetrics(history.series);
      return {
        ...s,
        score: quantFundScore(m),
        ret1y: m.ret1y,
        cagr3y: m.cagr3y,
        sharpe: m.sharpe,
        maxDD: m.maxDrawdown,
        loaded: true,
      };
    });
  }, [candidates, navQueries]);

  const filtered = useMemo(() => {
    const f = filters;
    return rows.filter((r) => {
      if (!r.loaded) return false;
      if (r.score != null && r.score < f.minScore) return false;
      if (r.ret1y != null && r.ret1y * 100 < f.min1y) return false;
      if (r.cagr3y != null && r.cagr3y * 100 < f.min3y) return false;
      if (r.maxDD != null && r.maxDD * 100 < f.maxDD) return false;
      if (r.sharpe != null && r.sharpe < f.minSharpe) return false;
      return true;
    });
  }, [rows, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortField] as number | null;
      const vb = b[sortField] as number | null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [filtered, sortField, sortDir]);

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const toggleSort = (field: keyof Row) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const asOf = allSchemes?.[0]?.date ?? null;

  if (isError) {
    return (
      <AppShell title="Screener">
        <div className="flex gap-4 rounded-sm border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">Fund data unavailable</p>
            <p className="text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Screener">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI fund universe…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Screener">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Screener</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Threshold-based filtering · Metrics from real NAV history
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf} note={`Top ${TOP_N} Direct-Growth schemes per category, scored from real NAV history.`} />
        </div>

        {/* Controls */}
        <div className="mb-4 grid gap-3 rounded-sm border border-border bg-surface p-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Category */}
          <div>
            <label className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as QuantFundCategory)}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-cyan focus:outline-none"
            >
              {QUANTFUND_CATEGORIES.filter((c) => c !== "Unknown").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Min Score */}
          <FilterSlider
            label="Min QF Score"
            value={filters.minScore}
            min={0} max={100} step={5}
            display={(v) => v.toFixed(0)}
            onChange={(v) => setFilters((f) => ({ ...f, minScore: v }))}
          />

          {/* Min 1Y Return */}
          <FilterSlider
            label="Min 1Y Return (%)"
            value={filters.min1y}
            min={-30} max={60} step={5}
            display={(v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"}
            onChange={(v) => setFilters((f) => ({ ...f, min1y: v }))}
          />

          {/* Min 3Y CAGR */}
          <FilterSlider
            label="Min 3Y CAGR (%)"
            value={filters.min3y}
            min={-20} max={40} step={5}
            display={(v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"}
            onChange={(v) => setFilters((f) => ({ ...f, min3y: v }))}
          />

          {/* Max Drawdown */}
          <FilterSlider
            label="Max Drawdown floor (%)"
            value={filters.maxDD}
            min={-80} max={0} step={5}
            display={(v) => v.toFixed(0) + "%"}
            onChange={(v) => setFilters((f) => ({ ...f, maxDD: v }))}
          />

          {/* Min Sharpe */}
          <FilterSlider
            label="Min Sharpe Ratio"
            value={filters.minSharpe}
            min={-2} max={3} step={0.25}
            display={(v) => v.toFixed(2)}
            onChange={(v) => setFilters((f) => ({ ...f, minSharpe: v }))}
          />
        </div>

        {/* Status bar */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {navLoaded < navTotal ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Scoring {navLoaded}/{navTotal}…
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {sorted.length} of {rows.filter((r) => r.loaded).length} schemes match
              </>
            )}
            {filtersActive && (
              <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-cyan">
                Filters active
              </span>
            )}
          </div>
          {filtersActive && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Reset filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-background/40 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <th className="p-3 font-medium">Scheme</th>
                  <SortTh label="Score" field="score" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="1Y" field="ret1y" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="3Y CAGR" field="cagr3y" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Sharpe" field="sharpe" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Max DD" field="maxDD" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.length === 0 && navLoaded === navTotal && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      No schemes match the current filters. Try relaxing the thresholds.
                    </td>
                  </tr>
                )}
                {sorted.map((s) => (
                  <tr key={s.schemeCode} className="group transition-colors hover:bg-cyan/[0.04]">
                    <td className="p-3">
                      <Link to="/fund/$id" params={{ id: s.schemeCode }}
                        className="text-[12px] font-semibold leading-tight text-foreground hover:text-cyan">
                        {s.schemeName}
                      </Link>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {s.amc} · #{s.schemeCode} · NAV ₹{s.nav.toFixed(2)}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {s.score != null ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="font-mono text-[11px] font-bold tabular-nums text-cyan">{fmtNum(s.score, 1)}</span>
                          <div className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-border">
                            <div className="h-full bg-cyan" style={{ width: `${Math.min(100, s.score)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </td>
                    <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(s.ret1y)}`}>
                      {fmtPct(s.ret1y, { signed: true })}
                    </td>
                    <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.cagr3y)}`}>
                      {fmtPct(s.cagr3y, { signed: true })}
                    </td>
                    <td className="p-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {fmtNum(s.sharpe, 2)}
                    </td>
                    <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.maxDD)}`}>
                      {fmtPct(s.maxDD, { signed: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
          Screener loads the top {TOP_N} Direct-Growth schemes for the selected category and computes metrics from real NAV history.
          All filters apply client-side after loading. Unfocused schemes (no sufficient NAV history) are excluded.
          Data from{" "}
          <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}and{" "}
          <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Data last updated: {asOf ?? "—"}.
        </p>
      </div>
    </AppShell>
  );
}

function FilterSlider({
  label, value, min, max, step, display, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
        <span className="font-mono text-[10px] text-cyan">{display(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan"
      />
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{display(min)}</span>
        <span>{display(max)}</span>
      </div>
    </div>
  );
}

function SortTh({
  label, field, sortField, sortDir, onSort,
}: {
  label: string;
  field: keyof Row;
  sortField: keyof Row;
  sortDir: "asc" | "desc";
  onSort: (f: keyof Row) => void;
}) {
  const active = sortField === field;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap">
      <button onClick={() => onSort(field)} className={active ? "text-cyan" : "hover:text-foreground"}>
        {label}{active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}
