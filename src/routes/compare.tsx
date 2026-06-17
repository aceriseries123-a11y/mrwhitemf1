/**
 * compare.tsx — Fully Functional Fund Comparison
 *
 * Compare up to 4 Direct-Growth funds side-by-side:
 *   - Search & add funds from the scored universe (no extra fetches needed)
 *   - Indexed NAV chart (rebased to 100 from a common start date)
 *   - Metric comparison table (Fund Score, Confidence, 3Y/5Y CAGR, Sharpe,
 *     Sortino, Max Drawdown, Rolling 3Y Avg, Info Ratio, Alpha, Beta)
 *   - Colour-coded winner highlight per metric row
 *   - Rolling return chart (3Y rolling)
 *   - Remove / clear individual funds
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  GitCompare, Search, X, TrendingUp, Shield, BarChart3,
  ChevronUp, ChevronDown, Trophy, Minus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Chart } from "@/components/Chart";
import { getFullRankedList, subscribeToRankedList, getSeries, type RankedFund } from "@/lib/fund-store";
import { fmtPct, fmtNum } from "@/lib/format";
import { categoryColor } from "@/lib/categories";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Fund Compare — QuantFund" },
      { name: "description", content: "Side-by-side comparison of up to 4 mutual funds on real NAV-derived metrics." },
    ],
  }),
  component: Compare,
});

const COLORS = ["#22d3ee", "#a78bfa", "#fb923c", "#4ade80"] as const;

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "22", borderColor: color + "66", color }}
      className="rounded-md border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

interface MetricDef {
  label: string;
  key: string;
  get: (f: RankedFund) => number | null;
  fmt: (v: number) => string;
  higherBetter: boolean;
  desc: string;
}

const METRICS: MetricDef[] = [
  { label: "Fund Score",        key: "fundScore",   get: f => f.finalScore,                  fmt: v => fmtNum(v, 1),               higherBetter: true,  desc: "QuantFund category-relative Fund Score (0–100)" },
  { label: "Confidence Score",  key: "confScore",   get: f => f.confidenceScore,             fmt: v => fmtNum(v, 1),               higherBetter: true,  desc: "Confidence in the Fund Score based on data quality & age" },
  { label: "3Y CAGR",           key: "cagr3y",      get: f => f.metrics.cagr3y,              fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  desc: "3-year CAGR from NAV history" },
  { label: "5Y CAGR",           key: "cagr5y",      get: f => f.metrics.cagr5y,              fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  desc: "5-year CAGR from NAV history" },
  { label: "Rolling 3Y Avg",    key: "roll3y",      get: f => f.metrics.rollingReturn3yAvg,  fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  desc: "Mean of all rolling 3-year returns (SIP-investor perspective)" },
  { label: "Rolling 5Y Avg",    key: "roll5y",      get: f => f.metrics.rollingReturn5yAvg,  fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  desc: "Mean of all rolling 5-year returns" },
  { label: "Sharpe Ratio",      key: "sharpe",      get: f => f.metrics.sharpe,              fmt: v => fmtNum(v, 2),               higherBetter: true,  desc: "(Return − RFR) / std dev — risk-adjusted performance" },
  { label: "Sortino Ratio",     key: "sortino",     get: f => f.metrics.sortino,             fmt: v => fmtNum(v, 2),               higherBetter: true,  desc: "(Return − RFR) / downside vol — rewards downside protection" },
  { label: "Max Drawdown",      key: "maxDD",       get: f => f.metrics.maxDrawdown,         fmt: v => fmtPct(v),                   higherBetter: false, desc: "Worst peak-to-trough decline in fund history" },
  { label: "Downside Capture",  key: "dnCap",       get: f => f.metrics.downsideCapture,     fmt: v => `${v.toFixed(1)}%`,         higherBetter: false, desc: "% of benchmark decline this fund captured — lower is better" },
  { label: "Upside Capture",    key: "upCap",       get: f => f.metrics.upsideCapture,       fmt: v => `${v.toFixed(1)}%`,         higherBetter: true,  desc: "% of benchmark rally this fund captured — higher is better" },
  { label: "Alpha (Jensen's)",  key: "alpha",       get: f => f.metrics.jensensAlpha,        fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  desc: "Excess return above CAPM expectation" },
  { label: "Information Ratio", key: "ir",          get: f => f.metrics.informationRatio,    fmt: v => fmtNum(v, 2),               higherBetter: true,  desc: "Alpha per unit of tracking error — consistency of outperformance" },
  { label: "Beta",              key: "beta",        get: f => f.metrics.beta,                fmt: v => fmtNum(v, 2),               higherBetter: false, desc: "Market sensitivity vs category benchmark" },
  { label: "Std Dev (Ann.)",    key: "stdDev",      get: f => f.metrics.stdDev,              fmt: v => fmtPct(v),                   higherBetter: false, desc: "Annualised volatility of daily returns" },
  { label: "History (yrs)",     key: "hist",        get: f => f.metrics.historyYears,        fmt: v => `${v.toFixed(1)}y`,         higherBetter: true,  desc: "Years of NAV history available" },
];

function FundSearch({
  onAdd,
  added,
  allFunds,
}: {
  onAdd: (f: RankedFund) => void;
  added: Set<string>;
  allFunds: RankedFund[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    return allFunds
      .filter(f => !added.has(f.schemeCode) &&
        (f.schemeName.toLowerCase().includes(lq) || f.amc.toLowerCase().includes(lq)))
      .slice(0, 8);
  }, [q, allFunds, added]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search fund to add…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-8 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none"
        />
        {q && <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {results.map(f => (
            <button key={f.schemeCode} onClick={() => { onAdd(f); setQ(""); setOpen(false); }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cyan/[0.07] border-b border-border/50 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-foreground">{f.schemeName}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.amc} · {f.poolCategory}</p>
              </div>
              {f.finalScore != null && (
                <span className="shrink-0 font-mono text-[11px] font-bold text-cyan">{fmtNum(f.finalScore, 0)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Compare() {
  const [allFunds, setAllFunds] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllFunds(getFullRankedList())), []);

  const [selected, setSelected] = useState<RankedFund[]>([]);

  const addFund = (f: RankedFund) => {
    if (selected.length >= 4 || selected.find(s => s.schemeCode === f.schemeCode)) return;
    setSelected(prev => [...prev, f]);
  };
  const removeFund = (code: string) => setSelected(prev => prev.filter(f => f.schemeCode !== code));
  const clearAll = () => setSelected([]);

  // Build indexed NAV chart data
  const chartData = useMemo(() => {
    if (selected.length === 0) return [];
    // Find the latest common start date across all selected funds
    const allSeries = selected.map(f => getSeries(f.schemeCode));
    if (allSeries.some(s => !s?.length)) return [];

    const starts = allSeries.map(s => s![0].t);
    const commonStart = Math.max(...starts);

    // Trim each series to common start date
    const trimmed = allSeries.map(s => s!.filter(p => p.t >= commonStart));
    if (trimmed.some(s => s.length === 0)) return [];

    // Build a unified set of dates from the first series
    const refSeries = trimmed[0];
    const points: Record<string, number | string>[] = [];

    for (const point of refSeries) {
      const row: Record<string, number | string> = { date: new Date(point.t).toISOString().slice(0, 10) };
      for (let i = 0; i < selected.length; i++) {
        const s = trimmed[i];
        // Find nearest nav at this timestamp
        const match = s.find(p => Math.abs(p.t - point.t) < 2 * 24 * 60 * 60 * 1000);
        const base = s[0].nav;
        if (match && base > 0) row[`fund${i}`] = Math.round((match.nav / base) * 1000) / 10;
      }
      if (Object.keys(row).length > 1) points.push(row);
    }
    return points;
  }, [selected]);

  if (allFunds.length === 0) {
    return (
      <AppShell title="Fund Compare">
        <div className="mx-auto max-w-xl py-24 text-center">
          <GitCompare className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
          <h2 className="font-display text-lg font-bold text-foreground">No data yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Fund Compare reads from Dashboard. Visit Dashboard first to score all funds.</p>
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background transition-opacity hover:opacity-90">
            Load on Dashboard →
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Fund Compare">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <GitCompare className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Fund Compare</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Compare up to 4 Direct-Growth funds · Real NAV data · Category-relative scoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FundSearch onAdd={addFund} added={new Set(selected.map(f => f.schemeCode))} allFunds={allFunds} />
            {selected.length > 0 && (
              <button onClick={clearAll} className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Selected fund chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((f, i) => (
              <div key={f.schemeCode}
                style={{ borderColor: COLORS[i] + "66", backgroundColor: COLORS[i] + "11" }}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 max-w-xs">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-foreground">{f.schemeName}</p>
                  <p className="font-mono text-[8px] text-muted-foreground">{f.poolCategory}</p>
                </div>
                <button onClick={() => removeFund(f.schemeCode)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {selected.length < 4 && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground/50 font-mono text-[11px]">
                <Search className="h-3.5 w-3.5" /> Add fund…
              </div>
            )}
          </div>
        )}

        {selected.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl border border-dashed border-border bg-surface/40 py-24 text-center">
            <GitCompare className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-20" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Search and add up to 4 funds to compare</p>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground opacity-60">{allFunds.length.toLocaleString()} scored funds available</p>
          </div>
        ) : (
          <>
            {/* NAV Chart — indexed to 100 from common start */}
            {chartData.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Indexed NAV Performance</span>
                  <span className="font-mono text-[9px] text-muted-foreground">(rebased to 100 from common start date)</span>
                </div>
                <Chart
                  height={280}
                  option={{
                    legend: {
                      data: selected.map(f => f.schemeName.length > 35 ? f.schemeName.slice(0, 35) + "…" : f.schemeName),
                      textStyle: { color: "rgba(245,247,250,0.65)", fontSize: 10 },
                      bottom: 0,
                    },
                    xAxis: {
                      type: "category",
                      data: chartData.map(d => d.date as string),
                      axisLabel: {
                        color: "rgba(245,247,250,0.45)", fontSize: 10,
                        formatter: (v: string) => v.slice(0, 7),
                        interval: Math.floor(chartData.length / 8),
                      },
                      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
                      axisTick: { show: false },
                    },
                    yAxis: {
                      type: "value",
                      name: "Indexed (100 = start)",
                      nameTextStyle: { color: "rgba(245,247,250,0.4)", fontSize: 9 },
                      axisLabel: { color: "rgba(245,247,250,0.45)", fontSize: 10 },
                      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
                      splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
                    },
                    series: selected.map((f, i) => ({
                      name: f.schemeName.length > 35 ? f.schemeName.slice(0, 35) + "…" : f.schemeName,
                      type: "line",
                      data: chartData.map(d => d[`fund${i}`] ?? null),
                      lineStyle: { color: COLORS[i], width: 2 },
                      itemStyle: { color: COLORS[i] },
                      symbol: "none",
                      smooth: false,
                    })),
                    tooltip: { trigger: "axis", formatter: (params: any) => {
                      const p = Array.isArray(params) ? params : [];
                      const date = (p[0]?.axisValue ?? "").toString().slice(0, 10);
                      return `<div style="font-size:11px">${date}<br/>${p.map((pp: any) => `<span style="color:${pp.color}">●</span> ${pp.seriesName}: <b>${pp.value ?? "—"}</b>`).join("<br/>")}</div>`;
                    }},
                  }}
                />
              </div>
            )}

            {/* Metric comparison table */}
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="border-b border-border bg-background/60 px-5 py-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Metric Comparison</span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                  <Trophy className="inline h-3 w-3 text-cyan mr-1" />= best in row &nbsp;
                  <span className="text-positive">green</span> = better · <span className="text-negative">red</span> = worse
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border font-mono text-[9px] uppercase tracking-widest text-muted-foreground bg-background/40">
                      <th className="p-3 font-medium w-40">Metric</th>
                      {selected.map((f, i) => (
                        <th key={f.schemeCode} className="p-3 font-medium text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                              <span className="text-foreground max-w-[160px] truncate block text-right" title={f.schemeName}>
                                {f.schemeName.length > 22 ? f.schemeName.slice(0, 22) + "…" : f.schemeName}
                              </span>
                            </div>
                            <CategoryBadge cat={f.poolCategory} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {METRICS.map(metric => {
                      const vals = selected.map(f => metric.get(f));
                      const validVals = vals.filter((v): v is number => v != null);
                      const best = validVals.length === 0 ? null
                        : metric.higherBetter ? Math.max(...validVals) : Math.min(...validVals);
                      const worst = validVals.length === 0 ? null
                        : metric.higherBetter ? Math.min(...validVals) : Math.max(...validVals);
                      return (
                        <tr key={metric.key} className="hover:bg-cyan/[0.03] transition-colors">
                          <td className="p-3">
                            <p className="font-mono text-[10px] font-semibold text-foreground">{metric.label}</p>
                            <p className="font-mono text-[8px] text-muted-foreground leading-tight mt-0.5 max-w-[140px]">{metric.desc}</p>
                          </td>
                          {vals.map((v, i) => {
                            const isBest = v != null && best != null && Math.abs(v - best) < 0.0001;
                            const isWorst = v != null && worst != null && validVals.length > 1 && Math.abs(v - worst) < 0.0001 && !isBest;
                            const color = isBest ? "text-positive" : isWorst ? "text-negative" : "text-foreground";
                            return (
                              <td key={i} className="p-3 text-right">
                                {v != null ? (
                                  <div className="inline-flex flex-col items-end gap-0.5">
                                    <span className={`font-mono text-[12px] font-bold tabular-nums ${color}`}>
                                      {metric.fmt(v)}
                                    </span>
                                    {isBest && validVals.length > 1 && <Trophy className="h-2.5 w-2.5 text-cyan" />}
                                    {isWorst && <ChevronDown className="h-2.5 w-2.5 text-negative" />}
                                  </div>
                                ) : (
                                  <span className="font-mono text-[10px] text-muted-foreground"><Minus className="inline h-3 w-3" /></span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-background/40 px-5 py-2.5 font-mono text-[9px] text-muted-foreground">
                All metrics computed from NAV history via mfapi.in · Category-relative scores · {selected.length} fund{selected.length !== 1 ? "s" : ""} compared
              </div>
            </div>

            {/* Fund Score cards */}
            <div className={`grid gap-4 ${selected.length === 1 ? "grid-cols-1 max-w-xs" : selected.length === 2 ? "grid-cols-2" : selected.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {selected.map((f, i) => (
                <div key={f.schemeCode} style={{ borderColor: COLORS[i] + "44" }} className="rounded-xl border bg-surface p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <div className="h-3 w-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLORS[i] }} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-foreground leading-snug">
                        <Link to="/fund/$id" params={{ id: f.schemeCode }} className="hover:text-cyan transition-colors">
                          {f.schemeName}
                        </Link>
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-0.5">{f.amc}</p>
                      <div className="mt-1.5"><CategoryBadge cat={f.poolCategory} /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Fund Score", value: f.finalScore != null ? fmtNum(f.finalScore, 1) : "—", color: "text-cyan" },
                      { label: "Confidence", value: f.confidenceScore != null ? fmtNum(f.confidenceScore, 1) : "—", color: "text-foreground" },
                      { label: "Rating", value: f.rating ?? "—", color: f.ratingColor ?? "text-muted-foreground" },
                      { label: "Cat. Rank", value: f.categoryRank != null ? `#${f.categoryRank}` : "—", color: "text-foreground" },
                    ].map(item => (
                      <div key={item.label} className="rounded-lg border border-border/60 bg-background/40 px-2 py-1.5">
                        <p className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                        <p className={`font-mono text-[13px] font-bold tabular-nums ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {f.metrics.historyYears && (
                    <p className="mt-2 font-mono text-[8px] text-muted-foreground">
                      {f.metrics.historyYears.toFixed(1)}y history · ₹{f.nav.toFixed(2)} NAV
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Risk comparison visual */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-cyan" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Risk at a Glance</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Max Drawdown", get: (f: RankedFund) => f.metrics.maxDrawdown, fmt: (v: number) => fmtPct(v), desc: "Worst loss from peak", higherBetter: false },
                  { label: "Sortino Ratio", get: (f: RankedFund) => f.metrics.sortino, fmt: (v: number) => fmtNum(v, 2), desc: "Return / downside risk", higherBetter: true },
                  { label: "Downside Cap", get: (f: RankedFund) => f.metrics.downsideCapture, fmt: (v: number) => `${v.toFixed(1)}%`, desc: "% of falls captured", higherBetter: false },
                  { label: "Upside Cap",   get: (f: RankedFund) => f.metrics.upsideCapture,   fmt: (v: number) => `${v.toFixed(1)}%`, desc: "% of rallies captured", higherBetter: true },
                ].map(metric => (
                  <div key={metric.label} className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{metric.label}</p>
                    <p className="font-mono text-[8px] text-muted-foreground/60 mb-2">{metric.desc}</p>
                    {selected.map((f, i) => {
                      const v = metric.get(f);
                      return (
                        <div key={f.schemeCode} className="flex items-center gap-2 mb-1">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                          <span className={`font-mono text-[11px] font-bold tabular-nums ${v == null ? "text-muted-foreground" : metric.higherBetter ? (v > 0 ? "text-positive" : "text-foreground") : (v < 0 ? "text-positive" : "text-foreground")}`}>
                            {v != null ? metric.fmt(v) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
