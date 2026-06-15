/**
 * screener.tsx — Quantitative Fund Screener
 *
 * 15 slider filters (all from engine metrics) · reads fund-store (no per-fund fetches)
 * Category coloured badges · instant client-side filtering
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, categoryColor, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — QuantFund" },
      { name: "description", content: "Screen Indian mutual funds by quantitative criteria — all filters from real NAV data." },
    ],
  }),
  component: FundScreener,
});

const ALL_CATS: Array<"All" | QuantFundCategory> = [
  "All", ...(QUANTFUND_CATEGORIES.filter(c => c !== "Unknown") as QuantFundCategory[]),
];

interface Filters {
  minScore:      number;
  minCagr3y:     number;
  maxMaxDD:      number;
  minSharpe:     number;
  minSortino:    number;
  minRollingPos: number;
  maxBeta:       number;
  maxStdDev:     number;
  minHistory:    number;
  minAlpha:      number;
  minInfoRatio:  number;
  minUpsideCap:  number;
  maxDownsideCap:number;
  minOmega:      number;
  minCalmar:     number;
  catFilter:     "All" | QuantFundCategory;
}

const DEFAULT: Filters = {
  minScore:      0,
  minCagr3y:     -50,
  maxMaxDD:      -100,
  minSharpe:     -3,
  minSortino:    -3,
  minRollingPos: 0,
  maxBeta:       5,
  maxStdDev:     100,
  minHistory:    0,
  minAlpha:      -50,
  minInfoRatio:  -5,
  minUpsideCap:  0,
  maxDownsideCap:200,
  minOmega:      0,
  minCalmar:     -5,
  catFilter:     "All",
};

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "22", borderColor: color + "66", color }}
      className="rounded-md border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

function SliderRow({ label, min, max, step, value, unit, onChange }: {
  label: string; min: number; max: number; step: number;
  value: number; unit?: string; onChange: (v: number) => void;
}) {
  const display = unit === "%" ? `${value.toFixed(1)}%` : unit === "x" ? `${value.toFixed(2)}x` : `${value.toFixed(2)}`;
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-[9px] font-bold text-cyan">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-cyan" />
    </div>
  );
}

function FundScreener() {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [allRanked, setAllRanked] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllRanked(getFullRankedList())), []);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters(prev => ({ ...prev, [k]: v }));

  const results = useMemo(() => {
    return allRanked.filter(f => {
      const m = f.metrics;
      if (filters.catFilter !== "All" && f.poolCategory !== filters.catFilter) return false;
      if (f.finalScore != null && f.finalScore < filters.minScore) return false;
      if (m.cagr3y != null && m.cagr3y * 100 < filters.minCagr3y) return false;
      if (m.maxDrawdown != null && m.maxDrawdown * 100 < filters.maxMaxDD) return false;
      if (m.sharpe != null && m.sharpe < filters.minSharpe) return false;
      if (m.sortino != null && m.sortino < filters.minSortino) return false;
      if (m.rollingPos1y != null && m.rollingPos1y * 100 < filters.minRollingPos) return false;
      if (m.beta != null && m.beta > filters.maxBeta) return false;
      if (m.stdDev != null && m.stdDev * 100 > filters.maxStdDev) return false;
      if (m.historyYears < filters.minHistory) return false;
      if (m.jensensAlpha != null && m.jensensAlpha * 100 < filters.minAlpha) return false;
      if (m.informationRatio != null && m.informationRatio < filters.minInfoRatio) return false;
      if (m.upsideCapture != null && m.upsideCapture < filters.minUpsideCap) return false;
      if (m.downsideCapture != null && m.downsideCapture > filters.maxDownsideCap) return false;
      if (m.omegaRatio != null && m.omegaRatio < filters.minOmega) return false;
      if (m.calmarRatio != null && m.calmarRatio < filters.minCalmar) return false;
      return true;
    }).sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
  }, [allRanked, filters]);

  const active = Object.entries(filters).filter(([k, v]) =>
    k !== "catFilter" && v !== (DEFAULT as unknown as Record<string, unknown>)[k]
  ).length + (filters.catFilter !== "All" ? 1 : 0);

  if (allRanked.length === 0) return (
    <AppShell title="Screener">
      <div className="mx-auto max-w-xl py-24 text-center">
        <Filter className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
        <h2 className="font-display text-lg font-bold text-foreground">No data yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Screener reads from Dashboard. Visit Dashboard first.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background">Load on Dashboard →</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Screener">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5"><SlidersHorizontal className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Fund Screener</h1></div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} funds · 15 quantitative filters · instant screening
            </p>
          </div>
          <button onClick={() => setFilters(DEFAULT)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-cyan/60 hover:text-foreground">
            Reset{active > 0 ? ` (${active})` : ""}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* Filter panel */}
          <div className="h-fit rounded-xl border border-border bg-surface p-4 shadow-lg">
            <p className="mb-4 font-mono text-[9px] uppercase tracking-widest text-cyan font-bold">Filters {active > 0 ? `· ${active} active` : ""}</p>
            <div className="space-y-4">
              <select value={filters.catFilter} onChange={e => set("catFilter", e.target.value as "All" | QuantFundCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:border-cyan/60 focus:outline-none">
                {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <SliderRow label="Min Fund Score" min={0} max={100} step={1} value={filters.minScore} onChange={v => set("minScore", v)} />
              <SliderRow label="Min 3Y CAGR" min={-30} max={50} step={0.5} value={filters.minCagr3y} unit="%" onChange={v => set("minCagr3y", v)} />
              <SliderRow label="Max Drawdown ≥" min={-100} max={0} step={0.5} value={filters.maxMaxDD} unit="%" onChange={v => set("maxMaxDD", v)} />
              <SliderRow label="Min Sharpe" min={-2} max={5} step={0.05} value={filters.minSharpe} onChange={v => set("minSharpe", v)} />
              <SliderRow label="Min Sortino" min={-2} max={8} step={0.05} value={filters.minSortino} onChange={v => set("minSortino", v)} />
              <SliderRow label="Min Rolling 1Y+" min={0} max={100} step={1} value={filters.minRollingPos} unit="%" onChange={v => set("minRollingPos", v)} />
              <SliderRow label="Max Beta" min={0} max={2.5} step={0.05} value={filters.maxBeta} onChange={v => set("maxBeta", v)} />
              <SliderRow label="Max Std Dev" min={0} max={80} step={0.5} value={filters.maxStdDev} unit="%" onChange={v => set("maxStdDev", v)} />
              <SliderRow label="Min History (years)" min={0} max={15} step={0.5} value={filters.minHistory} onChange={v => set("minHistory", v)} />
              <SliderRow label="Min Jensen's Alpha" min={-20} max={20} step={0.5} value={filters.minAlpha} unit="%" onChange={v => set("minAlpha", v)} />
              <SliderRow label="Min Info Ratio" min={-3} max={3} step={0.05} value={filters.minInfoRatio} onChange={v => set("minInfoRatio", v)} />
              <SliderRow label="Min Upside Cap" min={0} max={200} step={1} value={filters.minUpsideCap} unit="%" onChange={v => set("minUpsideCap", v)} />
              <SliderRow label="Max Downside Cap" min={0} max={200} step={1} value={filters.maxDownsideCap} unit="%" onChange={v => set("maxDownsideCap", v)} />
              <SliderRow label="Min Omega Ratio" min={0} max={5} step={0.05} value={filters.minOmega} onChange={v => set("minOmega", v)} />
              <SliderRow label="Min Calmar" min={-5} max={5} step={0.05} value={filters.minCalmar} onChange={v => set("minCalmar", v)} />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="text-cyan font-bold">{results.length.toLocaleString()}</span> funds match
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-border font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    <th className="p-3 text-center font-medium w-10">Sno</th>
                    <th className="p-3 font-medium">Fund</th>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 text-right font-medium">Score</th>
                    <th className="p-3 text-right font-medium">3Y CAGR</th>
                    <th className="p-3 text-right font-medium">Sharpe</th>
                    <th className="p-3 text-right font-medium">Sortino</th>
                    <th className="p-3 text-right font-medium">Max DD</th>
                    <th className="p-3 text-right font-medium">Rolling 1Y+</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {results.length === 0 ? (
                    <tr><td colSpan={9} className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No funds match — loosen filters</td></tr>
                  ) : results.map((f, idx) => {
                    const m = f.metrics;
                    return (
                      <tr key={f.schemeCode} className="transition-colors hover:bg-cyan/[0.04]">
                        <td className="p-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 max-w-[240px]">
                          <Link to="/fund/$id" params={{ id: f.schemeCode }}
                            className="block text-[12px] font-semibold leading-snug text-foreground hover:text-cyan">{f.schemeName}</Link>
                          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc}</p>
                        </td>
                        <td className="p-3"><CategoryBadge cat={f.poolCategory as string} /></td>
                        <td className="p-3 text-right">
                          {f.finalScore != null ? <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">{fmtNum(f.finalScore, 1)}</span>
                            : <span className="text-muted-foreground font-mono text-[10px]">—</span>}
                        </td>
                        <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${m.cagr3y != null && m.cagr3y >= 0 ? "text-positive" : "text-negative"}`}>
                          {fmtPct(m.cagr3y, { signed: true })}
                        </td>
                        <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${m.sharpe != null && m.sharpe >= 0 ? "text-positive" : "text-negative"}`}>
                          {m.sharpe != null ? fmtNum(m.sharpe, 2) : "—"}
                        </td>
                        <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${m.sortino != null && m.sortino >= 0 ? "text-positive" : "text-negative"}`}>
                          {m.sortino != null ? fmtNum(m.sortino, 2) : "—"}
                        </td>
                        <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${m.maxDrawdown != null && m.maxDrawdown >= -0.2 ? "text-positive" : "text-negative"}`}>
                          {fmtPct(m.maxDrawdown)}
                        </td>
                        <td className="p-3 text-right font-mono text-[11px] tabular-nums text-foreground">
                          {m.rollingPos1y != null ? `${(m.rollingPos1y * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
