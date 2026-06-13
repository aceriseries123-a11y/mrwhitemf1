import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertCircle, Loader2, Filter, X, CheckCircle2, SlidersHorizontal } from "lucide-react";
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

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

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
  const allReady = navLoaded === navTotal && navTotal > 0;

  const rows: Row[] = useMemo(() => {
    return candidates.map((s, i) => {
      const history = navQueries[i]?.data;
      if (!history) return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null, loaded: false };
      const m = computeFundMetrics(history.series);
      return { ...s, score: quantFundScore(m), ret1y: m.ret1y, cagr3y: m.cagr3y, sharpe: m.sharpe, maxDD: m.maxDrawdown, loaded: true };
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
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">Fund data unavailable</p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
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
      <div className="mx-auto max-w-6xl space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Screener</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Threshold-based filtering · Metrics from real NAV history
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note={`Top ${TOP_N} Direct-Growth schemes per category, scored from real NAV history.`} />
        </div>

        {/* Filter panel */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Filters</span>
            {filtersActive && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Category */}
            <div>
              <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as QuantFundCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-cyan"
              >
                {QUANTFUND_CATEGORIES.filter((c) => c !== "Unknown").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <FilterSlider label="Min QF Score" value={filters.minScore} min={0} max={100} step={5}
              display={(v) => v.toFixed(0)} onChange={(v) => setFilters((f) => ({ ...f, minScore: v }))} />
            <FilterSlider label="Min 1Y Return (%)" value={filters.min1y} min={-30} max={60} step={5}
              display={(v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"}
              onChange={(v) => setFilters((f) => ({ ...f, min1y: v }))} />
            <FilterSlider label="Min 3Y CAGR (%)" value={filters.min3y} min={-20} max={40} step={5}
              display={(v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%"}
              onChange={(v) => setFilters((f) => ({ ...f, min3y: v }))} />
            <FilterSlider label="Max Drawdown floor (%)" value={filters.maxDD} min={-80} max={0} step={5}
              display={(v) => v.toFixed(0) + "%"}
              onChange={(v) => setFilters((f) => ({ ...f, maxDD: v }))} />
            <FilterSlider label="Min Sharpe Ratio" value={filters.minSharpe} min={-2} max={3} step={0.25}
              display={(v) => v.toFixed(2)} onChange={(v) => setFilters((f) => ({ ...f, minSharpe: v }))} />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {!allReady ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-cyan" />
                <span>Scoring {navLoaded}/{navTotal} schemes…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-positive" />
                <span className="text-foreground">{sorted.length}</span>
                <span>of {rows.filter((r) => r.loaded).length} schemes match</span>
              </>
            )}
          </div>
          {filtersActive && (
            <span className="rounded-lg border border-cyan/40 bg-cyan/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan">
              {Object.values(filters).filter((v, i) => v !== Object.values(DEFAULT_FILTERS)[i]).length} filter{Object.values(filters).filter((v, i) => v !== Object.values(DEFAULT_FILTERS)[i]).length !== 1 ? "s" : ""} active
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  <th className="p-3 font-medium">Scheme</th>
                  <SortTh label="Score" field="score" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="1Y Ret" field="ret1y" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="3Y CAGR" field="cagr3y" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Sharpe" field="sharpe" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Max DD" field="maxDD" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sorted.length === 0 && allReady ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="flex flex-col items-center gap-3 py-16 text-center">
                        <Filter className="h-6 w-6 text-muted-foreground opacity-40" />
                        <p className="text-sm text-muted-foreground">No schemes pass the current filters.</p>
                        <button onClick={() => setFilters(DEFAULT_FILTERS)}
                          className="rounded-lg border border-border bg-surface px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                          Reset filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sorted.map((s) => (
                    <tr key={s.schemeCode} className="group transition-colors hover:bg-cyan/[0.04]">
                      <td className="p-3">
                        <Link to="/fund/$id" params={{ id: s.schemeCode }}
                          className="text-[12px] font-semibold leading-tight text-foreground transition-colors hover:text-cyan">
                          {s.schemeName}
                        </Link>
                        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          {s.amc} · #{s.schemeCode} · NAV ₹{s.nav.toFixed(2)}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        {s.score != null ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">
                              {fmtNum(s.score, 1)}
                            </span>
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-border">
                              <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, s.score)}%` }} />
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
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.sharpe)}`}>
                        {fmtNum(s.sharpe, 2)}
                      </td>
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(s.maxDD)}`}>
                        {fmtPct(s.maxDD, { signed: true })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Screener loads the top {TOP_N} Direct-Growth schemes for the selected category and computes all metrics from real NAV history.
          Filters apply client-side after loading. Schemes with insufficient NAV history are excluded.
          Data: <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}& <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Last updated: {asOf ?? "—"}.
        </p>
      </div>
    </AppShell>
  );
}

function FilterSlider({
  label, value, min, max, step, display, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  display: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</label>
        <span className="font-mono text-[10px] font-bold text-cyan">{display(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan" />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{display(min)}</span>
        <span>{display(max)}</span>
      </div>
    </div>
  );
}

function SortTh({
  label, field, sortField, sortDir, onSort,
}: {
  label: string; field: keyof Row; sortField: keyof Row;
  sortDir: "asc" | "desc"; onSort: (f: keyof Row) => void;
}) {
  const active = sortField === field;
  return (
    <th className="p-3 text-right font-medium whitespace-nowrap">
      <button onClick={() => onSort(field)}
        className={`transition-colors ${active ? "text-cyan" : "hover:text-foreground"}`}>
        {label}{active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}
