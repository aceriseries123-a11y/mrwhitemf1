/**
 * compare.tsx — Professional Fund Comparison Terminal
 * Up to 4 funds · indexed NAV chart · metric scorecard with winner verdict
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  GitCompare, Search, X, TrendingUp, Shield, Trophy,
  ChevronDown, ChevronUp, Minus, Star, AlertTriangle, Info,
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
      { name: "description", content: "Professional side-by-side comparison of up to 4 mutual funds with winner verdict." },
    ],
  }),
  component: Compare,
});

const FUND_COLORS = ["#22d3ee", "#a78bfa", "#fb923c", "#4ade80"] as const;
const FUND_LABELS = ["A", "B", "C", "D"] as const;

// ─── Metric definitions ───────────────────────────────────────────────────────

interface MetricDef {
  label: string;
  group: "Quality" | "Performance" | "Risk" | "Consistency";
  key: string;
  get: (f: RankedFund) => number | null;
  fmt: (v: number) => string;
  higherBetter: boolean;
  weight: number; // relative importance for final verdict (1-5)
  desc: string;
}

const METRICS: MetricDef[] = [
  // Quality
  { label: "Fund Score",       group: "Quality",      key: "fundScore",  get: f => f.finalScore,                 fmt: v => fmtNum(v, 1),               higherBetter: true,  weight: 5, desc: "Category-relative QuantFund Score (0–100)" },
  { label: "Confidence",       group: "Quality",      key: "conf",       get: f => f.confidenceScore,            fmt: v => fmtNum(v, 1),               higherBetter: true,  weight: 2, desc: "Data quality & history confidence (0–100)" },
  { label: "Cat. Rank",        group: "Quality",      key: "catRank",    get: f => f.categoryRank,               fmt: v => `#${v}`,                    higherBetter: false, weight: 3, desc: "Rank within the fund's own category" },
  // Performance
  { label: "3Y CAGR",          group: "Performance",  key: "cagr3y",     get: f => f.metrics.cagr3y,             fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  weight: 4, desc: "3-year compound annual growth rate" },
  { label: "5Y CAGR",          group: "Performance",  key: "cagr5y",     get: f => f.metrics.cagr5y,             fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  weight: 5, desc: "5-year compound annual growth rate" },
  { label: "Rolling 3Y Avg",   group: "Performance",  key: "r3y",        get: f => f.metrics.rollingReturn3yAvg, fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  weight: 5, desc: "Mean of all rolling 3Y returns — true SIP return" },
  { label: "Rolling 5Y Avg",   group: "Performance",  key: "r5y",        get: f => f.metrics.rollingReturn5yAvg, fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  weight: 4, desc: "Mean of all rolling 5Y returns" },
  { label: "Alpha (Jensen's)", group: "Performance",  key: "alpha",      get: f => f.metrics.jensensAlpha,       fmt: v => fmtPct(v, { signed: true }), higherBetter: true,  weight: 3, desc: "Excess return above CAPM expectation" },
  // Risk
  { label: "Sharpe Ratio",     group: "Risk",         key: "sharpe",     get: f => f.metrics.sharpe,             fmt: v => fmtNum(v, 2),               higherBetter: true,  weight: 4, desc: "Return per unit of total risk (RFR = 6.5%)" },
  { label: "Sortino Ratio",    group: "Risk",         key: "sortino",    get: f => f.metrics.sortino,            fmt: v => fmtNum(v, 2),               higherBetter: true,  weight: 4, desc: "Return per unit of downside risk only" },
  { label: "Max Drawdown",     group: "Risk",         key: "maxdd",      get: f => f.metrics.maxDrawdown,        fmt: v => fmtPct(v),                   higherBetter: false, weight: 4, desc: "Worst peak-to-trough loss in fund history" },
  { label: "Downside Cap",     group: "Risk",         key: "dnCap",      get: f => f.metrics.downsideCapture,    fmt: v => `${v.toFixed(1)}%`,          higherBetter: false, weight: 3, desc: "% of benchmark fall captured — lower is safer" },
  { label: "Std Dev",          group: "Risk",         key: "std",        get: f => f.metrics.stdDev,             fmt: v => fmtPct(v),                   higherBetter: false, weight: 3, desc: "Annualised volatility of daily returns" },
  { label: "Beta",             group: "Risk",         key: "beta",       get: f => f.metrics.beta,               fmt: v => fmtNum(v, 2),               higherBetter: false, weight: 2, desc: "Market sensitivity vs category benchmark" },
  // Consistency
  { label: "Upside Cap",       group: "Consistency",  key: "upCap",      get: f => f.metrics.upsideCapture,      fmt: v => `${v.toFixed(1)}%`,          higherBetter: true,  weight: 3, desc: "% of benchmark rally captured — higher is better" },
  { label: "Info Ratio",       group: "Consistency",  key: "ir",         get: f => f.metrics.informationRatio,   fmt: v => fmtNum(v, 2),               higherBetter: true,  weight: 3, desc: "Consistency of alpha vs tracking error" },
  { label: "History",          group: "Consistency",  key: "hist",       get: f => f.metrics.historyYears,       fmt: v => `${v.toFixed(1)}y`,          higherBetter: true,  weight: 1, desc: "Years of NAV data available" },
];

const GROUPS = ["Quality", "Performance", "Risk", "Consistency"] as const;
const GROUP_COLORS: Record<string, string> = {
  Quality: "#22d3ee", Performance: "#4ade80", Risk: "#fb923c", Consistency: "#a78bfa",
};

// ─── Winner computation ───────────────────────────────────────────────────────

function computeVerdicts(funds: RankedFund[]) {
  if (funds.length < 2) return null;

  // Per-metric wins: award `weight` points to the best fund on each metric
  const points = new Array(funds.length).fill(0);
  const wins = new Array(funds.length).fill(0);

  for (const m of METRICS) {
    const vals = funds.map(f => m.get(f));
    const valid = vals.map((v, i) => v != null ? { i, v } : null).filter(Boolean) as { i: number; v: number }[];
    if (valid.length < 2) continue;
    const best = m.higherBetter
      ? valid.reduce((a, b) => b.v > a.v ? b : a)
      : valid.reduce((a, b) => b.v < a.v ? b : a);
    points[best.i] += m.weight;
    wins[best.i]++;
  }

  // Per-group winner
  const groupWinner: Record<string, number> = {};
  for (const group of GROUPS) {
    const groupMetrics = METRICS.filter(m => m.group === group);
    const gPoints = new Array(funds.length).fill(0);
    for (const m of groupMetrics) {
      const vals = funds.map(f => m.get(f));
      const valid = vals.map((v, i) => v != null ? { i, v } : null).filter(Boolean) as { i: number; v: number }[];
      if (valid.length < 2) continue;
      const best = m.higherBetter
        ? valid.reduce((a, b) => b.v > a.v ? b : a)
        : valid.reduce((a, b) => b.v < a.v ? b : a);
      gPoints[best.i] += m.weight;
    }
    const maxP = Math.max(...gPoints);
    if (maxP > 0) groupWinner[group] = gPoints.indexOf(maxP);
  }

  const maxPoints = Math.max(...points);
  const overallWinner = points.indexOf(maxPoints);
  // Check for a tie
  const tied = points.filter(p => p === maxPoints).length > 1;

  return { points, wins, groupWinner, overallWinner: tied ? -1 : overallWinner, tied };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "1a", borderColor: color + "55", color }}
      className="rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

function FundSearch({ onAdd, added, allFunds }: {
  onAdd: (f: RankedFund) => void; added: Set<string>; allFunds: RankedFund[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    return allFunds.filter(f => !added.has(f.schemeCode) &&
      (f.schemeName.toLowerCase().includes(lq) || f.amc.toLowerCase().includes(lq))).slice(0, 7);
  }, [q, allFunds, added]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={ref} className="relative w-72">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder="Add fund to compare…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:border-cyan/50 focus:outline-none" />
        {q && <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-3 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          {results.map(f => (
            <button key={f.schemeCode} onClick={() => { onAdd(f); setQ(""); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cyan/[0.06] border-b border-border/40 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">{f.schemeName}</p>
                <p className="font-mono text-[8px] text-muted-foreground">{f.poolCategory} · {f.amc}</p>
              </div>
              {f.finalScore != null && (
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[11px] font-bold text-cyan">{Math.round(f.finalScore)}</p>
                  <p className={`font-mono text-[8px] ${f.ratingColor ?? "text-muted-foreground"}`}>{f.rating}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Compare() {
  const [allFunds, setAllFunds] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllFunds(getFullRankedList())), []);
  const [selected, setSelected] = useState<RankedFund[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(GROUPS));

  const addFund = (f: RankedFund) => {
    if (selected.length >= 4 || selected.find(s => s.schemeCode === f.schemeCode)) return;
    setSelected(p => [...p, f]);
  };
  const removeFund = (code: string) => setSelected(p => p.filter(f => f.schemeCode !== code));
  const toggleGroup = (g: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(g) ? next.delete(g) : next.add(g);
    return next;
  });

  const verdicts = useMemo(() => computeVerdicts(selected), [selected]);

  // Indexed NAV chart
  const chartOption = useMemo(() => {
    if (selected.length === 0) return null;
    const allSeries = selected.map(f => getSeries(f.schemeCode));
    if (allSeries.some(s => !s?.length)) return null;
    const commonStart = Math.max(...allSeries.map(s => s![0].t));
    const trimmed = allSeries.map(s => s!.filter(p => p.t >= commonStart));
    if (trimmed.some(s => s.length === 0)) return null;

    const refSeries = trimmed[0];
    // Sample every 7th point for performance
    const sampled = refSeries.filter((_, i) => i % 7 === 0);
    const dates = sampled.map(p => new Date(p.t).toISOString().slice(0, 10));

    const seriesData = selected.map((f, si) => {
      const s = trimmed[si];
      const base = s[0].nav;
      return {
        name: f.schemeName.length > 30 ? f.schemeName.slice(0, 30) + "…" : f.schemeName,
        type: "line" as const,
        data: sampled.map(ref => {
          const match = s.find(p => Math.abs(p.t - ref.t) < 4 * 24 * 60 * 60 * 1000);
          return match ? Math.round((match.nav / base) * 1000) / 10 : null;
        }),
        lineStyle: { color: FUND_COLORS[si], width: 2 },
        itemStyle: { color: FUND_COLORS[si] },
        symbol: "none",
        smooth: false,
        connectNulls: true,
      };
    });

    return {
      legend: { data: seriesData.map(s => s.name), bottom: 0, textStyle: { color: "rgba(245,247,250,0.6)", fontSize: 9 } },
      xAxis: {
        type: "category" as const, data: dates,
        axisLabel: { color: "rgba(245,247,250,0.4)", fontSize: 9, interval: Math.floor(dates.length / 6), formatter: (v: string) => v.slice(0, 7) },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const, name: "Indexed (base = 100)", nameTextStyle: { color: "rgba(245,247,250,0.35)", fontSize: 8 },
        axisLabel: { color: "rgba(245,247,250,0.4)", fontSize: 9 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      tooltip: {
        trigger: "axis" as const,
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params : [];
          const date = (p[0]?.axisValue ?? "").toString().slice(0, 10);
          return `<div style="font-size:10px;font-family:monospace">${date}<br/>${p.map((pp: any) =>
            `<span style="color:${pp.color}">●</span> ${pp.seriesName}: <b>${pp.value ?? "—"}</b>`
          ).join("<br/>")}</div>`;
        },
      },
      series: seriesData,
      grid: { left: 44, right: 16, top: 16, bottom: 48, containLabel: false },
    };
  }, [selected]);

  if (allFunds.length === 0) return (
    <AppShell title="Fund Compare">
      <div className="mx-auto max-w-lg py-28 text-center">
        <GitCompare className="mx-auto mb-5 h-10 w-10 text-muted-foreground opacity-25" />
        <h2 className="font-display text-lg font-bold">No scored funds yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Visit Dashboard first to score the full fund universe.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background hover:opacity-90">
          Go to Dashboard →
        </Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell title="Fund Compare">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <GitCompare className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold">Fund Compare</h1>
              <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                {selected.length}/4 funds
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Compare up to 4 funds · weighted winner verdict · real NAV data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FundSearch onAdd={addFund} added={new Set(selected.map(f => f.schemeCode))} allFunds={allFunds} />
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Fund chips row ── */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((f, i) => (
              <div key={f.schemeCode}
                style={{ borderColor: FUND_COLORS[i] + "55", background: FUND_COLORS[i] + "0d" }}
                className="flex items-center gap-2 rounded-xl border pl-2 pr-3 py-1.5 max-w-[280px]">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold text-background" style={{ backgroundColor: FUND_COLORS[i] }}>
                  {FUND_LABELS[i]}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-foreground">{f.schemeName.length > 30 ? f.schemeName.slice(0, 30) + "…" : f.schemeName}</p>
                  <p className="font-mono text-[8px] text-muted-foreground">{f.poolCategory}</p>
                </div>
                <button onClick={() => removeFund(f.schemeCode)} className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {selected.length < 4 && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground/50">
                <Search className="h-3 w-3" /> Add fund…
              </div>
            )}
          </div>
        )}

        {selected.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-28">
            <GitCompare className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Search and add funds to start comparing</p>
            <p className="font-mono text-[9px] text-muted-foreground opacity-50">{allFunds.length.toLocaleString()} scored funds available</p>
          </div>
        ) : (
          <>
            {/* ── Overall verdict banner ── */}
            {verdicts && selected.length >= 2 && (
              <div className={`rounded-2xl border p-4 ${verdicts.overallWinner >= 0 ? "border-cyan/30 bg-cyan/[0.05]" : "border-border bg-surface/60"}`}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-cyan" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Overall Verdict</span>
                  </div>
                  {verdicts.overallWinner >= 0 ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[10px] font-bold text-background" style={{ backgroundColor: FUND_COLORS[verdicts.overallWinner] }}>
                        {FUND_LABELS[verdicts.overallWinner]}
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-foreground">
                          {selected[verdicts.overallWinner].schemeName.length > 45
                            ? selected[verdicts.overallWinner].schemeName.slice(0, 45) + "…"
                            : selected[verdicts.overallWinner].schemeName}
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          won {verdicts.wins[verdicts.overallWinner]} of {METRICS.length} metrics · {verdicts.points[verdicts.overallWinner]} weighted points
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-[10px] text-muted-foreground">Too close to call — funds are tied overall</p>
                  )}
                  {/* Per-group winners */}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {GROUPS.map(g => {
                      const wi = verdicts.groupWinner[g];
                      return wi !== undefined ? (
                        <div key={g} style={{ borderColor: GROUP_COLORS[g] + "44", background: GROUP_COLORS[g] + "0f" }}
                          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1">
                          <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: GROUP_COLORS[g] }}>{g}</span>
                          <div className="flex h-4 w-4 items-center justify-center rounded-full font-mono text-[8px] font-bold text-background" style={{ backgroundColor: FUND_COLORS[wi] }}>
                            {FUND_LABELS[wi]}
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
                {/* Points bar */}
                <div className="mt-3 flex items-center gap-3">
                  {selected.map((f, i) => {
                    const pct = verdicts.points[i] / Math.max(...verdicts.points.filter(p => p > 0), 1) * 100;
                    return (
                      <div key={f.schemeCode} className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: FUND_COLORS[i] }} />
                            <span className="font-mono text-[8px] text-muted-foreground truncate max-w-[80px]">{FUND_LABELS[i]}</span>
                          </div>
                          <span className="font-mono text-[9px] font-bold tabular-nums" style={{ color: FUND_COLORS[i] }}>{verdicts.points[i]}pt</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: FUND_COLORS[i] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── NAV chart ── */}
            {chartOption && (
              <div className="rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                  <TrendingUp className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Indexed NAV</span>
                  <span className="font-mono text-[8px] text-muted-foreground">(rebased to 100 from common start date)</span>
                </div>
                <div className="p-4">
                  <Chart option={chartOption} height={260} />
                </div>
              </div>
            )}

            {/* ── Cross-category warning ── */}
            {selected.length >= 2 && new Set(selected.map(f => f.poolCategory)).size > 1 && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.05] px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-warning">Cross-Category Comparison</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    These funds belong to different categories. Fund Scores are category-relative (a Large Cap score of 80 ≠ a Small Cap score of 80).
                    The performance, risk, and consistency metrics are comparable, but category rank and Fund Score comparisons may be misleading.
                  </p>
                </div>
              </div>
            )}

            {/* ── Metric scorecard by group ── */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-background/60 px-5 py-3">
                <Star className="h-4 w-4 text-cyan" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Metric Scorecard</span>
                <span className="ml-auto font-mono text-[8px] text-muted-foreground">
                  <Trophy className="inline h-3 w-3 text-cyan mr-0.5" /> = winner · weight 1–5 = importance
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ minWidth: `${400 + selected.length * 130}px` }}>
                  <thead>
                    <tr className="border-b border-border bg-background/40">
                      <th className="p-3 w-52">
                        <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Metric</span>
                      </th>
                      {selected.map((f, i) => (
                        <th key={f.schemeCode} className="p-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: FUND_COLORS[i] }} />
                              <span className="font-mono text-[9px] font-bold" style={{ color: FUND_COLORS[i] }}>{FUND_LABELS[i]}</span>
                            </div>
                            <span className="font-mono text-[8px] text-muted-foreground text-right max-w-[120px] truncate">{f.schemeName.length > 18 ? f.schemeName.slice(0, 18) + "…" : f.schemeName}</span>
                            <CategoryBadge cat={f.poolCategory} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map(group => {
                      const groupMetrics = METRICS.filter(m => m.group === group);
                      const expanded = expandedGroups.has(group);
                      const groupWi = verdicts?.groupWinner[group];
                      return (
                        <>
                          {/* Group header row */}
                          <tr key={`g-${group}`}
                            className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                            onClick={() => toggleGroup(group)}>
                            <td colSpan={selected.length + 1} className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] }} />
                                <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: GROUP_COLORS[group] }}>{group}</span>
                                {groupWi !== undefined && (
                                  <div className="flex items-center gap-1 ml-2">
                                    <span className="font-mono text-[8px] text-muted-foreground">Leader:</span>
                                    <div className="flex h-4 w-4 items-center justify-center rounded-full font-mono text-[8px] font-bold text-background" style={{ backgroundColor: FUND_COLORS[groupWi] }}>
                                      {FUND_LABELS[groupWi]}
                                    </div>
                                  </div>
                                )}
                                <span className="ml-auto text-muted-foreground">
                                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Metric rows */}
                          {expanded && groupMetrics.map(metric => {
                            const vals = selected.map(f => metric.get(f));
                            const validVals = vals.filter((v): v is number => v != null);
                            const best = validVals.length < 2 ? null
                              : metric.higherBetter ? Math.max(...validVals) : Math.min(...validVals);
                            const worst = validVals.length < 2 ? null
                              : metric.higherBetter ? Math.min(...validVals) : Math.max(...validVals);
                            return (
                              <tr key={metric.key} className="border-t border-border/30 hover:bg-white/[0.015]">
                                <td className="px-5 py-2.5">
                                  <div className="flex items-start gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-mono text-[10px] font-medium text-foreground">{metric.label}</p>
                                        <div className="flex gap-0.5">
                                          {Array.from({ length: metric.weight }).map((_, wi) => (
                                            <div key={wi} className="h-1 w-1 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] + "99" }} />
                                          ))}
                                        </div>
                                      </div>
                                      <p className="font-mono text-[8px] text-muted-foreground mt-0.5 max-w-[180px] leading-tight">{metric.desc}</p>
                                    </div>
                                  </div>
                                </td>
                                {vals.map((v, ci) => {
                                  const isBest = v != null && best != null && Math.abs(v - best) < 0.00001;
                                  const isWorst = v != null && worst != null && validVals.length > 1 && Math.abs(v - worst) < 0.00001 && !isBest;
                                  return (
                                    <td key={ci} className="px-4 py-2.5 text-right">
                                      {v != null ? (
                                        <div className="inline-flex flex-col items-end gap-0.5">
                                          <span className={`font-mono text-[12px] font-bold tabular-nums ${isBest ? "text-positive" : isWorst ? "text-negative" : "text-foreground"}`}>
                                            {metric.fmt(v)}
                                          </span>
                                          {isBest && validVals.length > 1 && <Trophy className="h-2.5 w-2.5 text-cyan" />}
                                          {isWorst && <ChevronDown className="h-2.5 w-2.5 text-negative/70" />}
                                        </div>
                                      ) : (
                                        <Minus className="inline h-3 w-3 text-muted-foreground/40" />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-background/40 px-5 py-2 font-mono text-[8px] text-muted-foreground">
                Dots = metric weight (1–5) · Winner per group shown in header · Cross-category Fund Score comparisons may be misleading
              </div>
            </div>

            {/* ── Fund summary cards ── */}
            <div className={`grid gap-3 ${selected.length === 1 ? "max-w-xs" : `grid-cols-${selected.length}`}`}>
              {selected.map((f, i) => {
                const isOverallWinner = verdicts?.overallWinner === i;
                const borderCol = isOverallWinner ? FUND_COLORS[i] + "88" : FUND_COLORS[i] + "33";
                return (
                  <div key={f.schemeCode}
                    style={{ borderColor: borderCol, outline: isOverallWinner ? `1px solid ${FUND_COLORS[i]}33` : undefined }}
                    className="rounded-2xl border bg-surface p-4 relative">
                    {isOverallWinner && (
                      <div className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full border border-cyan/40 bg-cyan/10 px-2 py-0.5">
                        <Trophy className="h-2.5 w-2.5 text-cyan" />
                        <span className="font-mono text-[8px] font-bold uppercase text-cyan">Top pick</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2.5 mb-3 mt-1">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-background" style={{ backgroundColor: FUND_COLORS[i] }}>
                        {FUND_LABELS[i]}
                      </div>
                      <div className="min-w-0">
                        <Link to="/fund/$id" params={{ id: f.schemeCode }}
                          className="block text-[11px] font-bold text-foreground hover:text-cyan transition-colors leading-snug">
                          {f.schemeName}
                        </Link>
                        <p className="font-mono text-[8px] text-muted-foreground mt-0.5">{f.amc}</p>
                        <div className="mt-1"><CategoryBadge cat={f.poolCategory} /></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: "Fund Score", v: f.finalScore != null ? fmtNum(f.finalScore, 1) : "—", c: "text-cyan" },
                        { label: "Confidence", v: f.confidenceScore != null ? fmtNum(f.confidenceScore, 1) : "—", c: "text-foreground" },
                        { label: "Rating", v: f.rating ?? "—", c: f.ratingColor ?? "text-muted-foreground" },
                        { label: "Cat. Rank", v: f.categoryRank != null ? `#${f.categoryRank}` : "—", c: "text-foreground" },
                      ].map(row => (
                        <div key={row.label} className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
                          <p className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">{row.label}</p>
                          <p className={`font-mono text-[12px] font-bold ${row.c}`}>{row.v}</p>
                        </div>
                      ))}
                    </div>
                    {verdicts && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-mono text-[8px] text-muted-foreground">{verdicts.wins[i]} wins · {verdicts.points[i]} pts</span>
                        <Info className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Recommendation box ── */}
            {verdicts && verdicts.overallWinner >= 0 && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Analyst Notes</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selected.map((f, i) => {
                    const m = f.metrics;
                    const notes: string[] = [];
                    if ((m.rollingReturn3yAvg ?? 0) > 0.15) notes.push("Strong long-term rolling returns.");
                    if ((m.sharpe ?? 0) > 1.2) notes.push("Excellent risk-adjusted return (Sharpe > 1.2).");
                    if ((m.sortino ?? 0) > 1.5) notes.push("Well-controlled downside volatility.");
                    if ((m.maxDrawdown ?? 0) < -0.35) notes.push("High historical drawdown — review risk tolerance.");
                    if ((m.downsideCapture ?? 100) > 105) notes.push("Captures more downside than benchmark.");
                    if ((m.informationRatio ?? 0) > 0.5) notes.push("Consistent alpha generation vs benchmark.");
                    if ((m.historyYears ?? 0) < 5) notes.push("Short track record — confidence is limited.");
                    if (f.confidenceScore != null && f.confidenceScore < 60) notes.push("Lower confidence score — limited data.");
                    if (notes.length === 0) notes.push("No notable flags — review full metrics above.");
                    return (
                      <div key={f.schemeCode} className="rounded-xl border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: FUND_COLORS[i] }} />
                          <span className="font-mono text-[9px] font-bold" style={{ color: FUND_COLORS[i] }}>{FUND_LABELS[i]}</span>
                          <span className="font-mono text-[9px] text-muted-foreground truncate">{f.schemeName.length > 22 ? f.schemeName.slice(0, 22) + "…" : f.schemeName}</span>
                        </div>
                        <ul className="space-y-1">
                          {notes.map((n, ni) => (
                            <li key={ni} className="font-mono text-[9px] text-muted-foreground flex gap-1.5">
                              <span className="shrink-0 text-muted-foreground/40">·</span>{n}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
