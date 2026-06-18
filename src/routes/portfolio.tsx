/**
 * portfolio.tsx — Professional Portfolio Analyzer
 * Up to 10 funds · weighted metrics · optimization suggestions · swap candidates
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Briefcase, Search, X, Plus, TrendingUp, Shield,
  PieChart, AlertTriangle, Copy, Check, Lightbulb,
  ArrowUpDown, ChevronRight, RefreshCw, Info,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { fmtPct, fmtNum } from "@/lib/format";
import { categoryColor } from "@/lib/categories";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio Analyzer — QuantFund" },
      { name: "description", content: "Professional portfolio analysis: weighted metrics, diversification score, optimization suggestions." },
    ],
  }),
  component: Portfolio,
});

interface Holding {
  fund: RankedFund;
  alloc: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wtd(holdings: Holding[], weights: number[], get: (f: RankedFund) => number | null): number | null {
  let sum = 0, totalW = 0;
  for (let i = 0; i < holdings.length; i++) {
    const v = get(holdings[i].fund);
    if (v == null) continue;
    sum += v * weights[i];
    totalW += weights[i];
  }
  return totalW > 0 ? sum / totalW : null;
}

function toneClass(v: number | null, lo: number, hi: number, invert = false): string {
  if (v == null) return "text-muted-foreground";
  const good = invert ? v <= lo : v >= hi;
  const bad  = invert ? v >= hi : v <= lo;
  return good ? "text-positive" : bad ? "text-negative" : "text-warning";
}

function fmtAUM(cr: number): string {
  if (cr >= 10000) return `₹${(cr / 1000).toFixed(1)}K Cr`;
  if (cr >= 1000)  return `₹${(cr / 1000).toFixed(2)}K Cr`;
  return `₹${cr.toFixed(0)} Cr`;
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "1a", borderColor: color + "55", color }}
      className="rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

// ─── Optimization suggestions ─────────────────────────────────────────────────

interface Suggestion {
  type: "warning" | "info" | "swap";
  title: string;
  body: string;
  swapFrom?: string;
  swapTo?: RankedFund;
}

function generateSuggestions(
  holdings: Holding[],
  weights: number[],
  allFunds: RankedFund[],
  catExposure: [string, number][],
  metrics: ReturnType<typeof computeMetrics>,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  if (holdings.length < 2) return suggestions;

  // 1. Concentration warning
  for (const [cat, pct] of catExposure) {
    if (pct > 50) {
      suggestions.push({
        type: "warning",
        title: `${cat} over-concentration (${pct.toFixed(0)}%)`,
        body: `More than half your portfolio is in ${cat}. Consider reducing to ≤40% in any single category to improve diversification.`,
      });
    }
  }

  // 2. Duplicate category overlap
  const catCounts = new Map<string, number>();
  holdings.forEach(h => catCounts.set(h.fund.poolCategory, (catCounts.get(h.fund.poolCategory) ?? 0) + 1));
  for (const [cat, count] of catCounts) {
    if (count >= 3) {
      suggestions.push({
        type: "warning",
        title: `${count} funds in ${cat}`,
        body: `Holding multiple funds in the same category (${cat}) often results in highly correlated returns without true diversification benefit.`,
      });
    }
  }

  // 3. Low-scoring fund swap suggestion
  const sortedByScore = [...holdings].sort((a, b) => (a.fund.finalScore ?? 0) - (b.fund.finalScore ?? 0));
  const weakest = sortedByScore[0];
  if (weakest && (weakest.fund.finalScore ?? 0) < 50) {
    const sameCategory = allFunds
      .filter(f =>
        f.poolCategory === weakest.fund.poolCategory &&
        f.schemeCode !== weakest.fund.schemeCode &&
        !holdings.find(h => h.fund.schemeCode === f.schemeCode) &&
        (f.finalScore ?? 0) > (weakest.fund.finalScore ?? 0) + 15
      )
      .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0))
      .slice(0, 1)[0];
    if (sameCategory) {
      suggestions.push({
        type: "swap",
        title: `Consider replacing ${weakest.fund.schemeName.slice(0, 35)}…`,
        body: `Fund Score: ${fmtNum(weakest.fund.finalScore ?? 0, 0)} · This is the weakest fund in your portfolio. A higher-quality alternative in the same category is available.`,
        swapFrom: weakest.fund.schemeCode,
        swapTo: sameCategory,
      });
    }
  }

  // 4. Low confidence score
  const lowConf = holdings.filter(h => (h.fund.confidenceScore ?? 100) < 55);
  if (lowConf.length > 0) {
    suggestions.push({
      type: "info",
      title: `${lowConf.length} fund${lowConf.length > 1 ? "s" : ""} with low confidence score`,
      body: `${lowConf.map(h => h.fund.schemeName.slice(0, 25)).join(", ")} — low confidence usually indicates short history (< 5 years). Treat their scores with caution.`,
    });
  }

  // 5. High drawdown portfolio warning
  if (metrics.maxDD != null && metrics.maxDD < -0.35) {
    suggestions.push({
      type: "warning",
      title: `High portfolio drawdown (${fmtPct(metrics.maxDD)})`,
      body: `The weighted maximum drawdown exceeds 35%. Consider adding lower-volatility funds (Debt, Hybrid, or Large Cap) to cushion downside.`,
    });
  }

  // 6. Good diversification positive signal
  if (catExposure.length >= 4 && (metrics.fundScore ?? 0) >= 65) {
    suggestions.push({
      type: "info",
      title: "Well-diversified portfolio",
      body: `${catExposure.length} categories with a weighted Fund Score of ${fmtNum(metrics.fundScore!, 0)} — solid construction. Monitor periodically for style drift.`,
    });
  }

  // 7. Missing debt/hybrid allocation
  const hasStableAlloc = holdings.some(h =>
    ["Debt", "Hybrid", "Liquid", "Arbitrage"].some(c => h.fund.poolCategory.toLowerCase().includes(c.toLowerCase()))
  );
  if (!hasStableAlloc && holdings.length >= 4) {
    suggestions.push({
      type: "info",
      title: "Consider a debt or hybrid allocation",
      body: "Your portfolio is 100% equity. Adding 10–20% in debt or hybrid funds can reduce portfolio volatility and improve risk-adjusted returns.",
    });
  }

  return suggestions.slice(0, 6);
}

function computeMetrics(holdings: Holding[], weights: number[]) {
  return {
    fundScore:   wtd(holdings, weights, f => f.finalScore),
    confidence:  wtd(holdings, weights, f => f.confidenceScore),
    cagr3y:      wtd(holdings, weights, f => f.metrics.cagr3y),
    cagr5y:      wtd(holdings, weights, f => f.metrics.cagr5y),
    rolling3y:   wtd(holdings, weights, f => f.metrics.rollingReturn3yAvg),
    rolling5y:   wtd(holdings, weights, f => f.metrics.rollingReturn5yAvg),
    sharpe:      wtd(holdings, weights, f => f.metrics.sharpe),
    sortino:     wtd(holdings, weights, f => f.metrics.sortino),
    maxDD:       wtd(holdings, weights, f => f.metrics.maxDrawdown),
    infoRatio:   wtd(holdings, weights, f => f.metrics.informationRatio),
    beta:        wtd(holdings, weights, f => f.metrics.beta),
    alpha:       wtd(holdings, weights, f => f.metrics.jensensAlpha),
    stdDev:      wtd(holdings, weights, f => f.metrics.stdDev),
    upsideCap:   wtd(holdings, weights, f => f.metrics.upsideCapture),
    downsideCap: wtd(holdings, weights, f => f.metrics.downsideCapture),
  };
}

// ─── Fund search ──────────────────────────────────────────────────────────────

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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder="Search fund to add…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:border-cyan/50 focus:outline-none" />
        {q && <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
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

function Portfolio() {
  const [allFunds, setAllFunds] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllFunds(getFullRankedList())), []);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [copied, setCopied] = useState(false);

  const addFund = (f: RankedFund) => {
    if (holdings.length >= 10 || holdings.find(h => h.fund.schemeCode === f.schemeCode)) return;
    const n = holdings.length + 1;
    const each = Math.floor(100 / n);
    setHoldings(prev => [...prev.map((h, i) => ({ ...h, alloc: each + (i === 0 ? 100 - each * n : 0) })), { fund: f, alloc: each }]);
  };
  const removeFund = (code: string) => setHoldings(prev => prev.filter(h => h.fund.schemeCode !== code));
  const setAlloc = (code: string, v: number) =>
    setHoldings(prev => prev.map(h => h.fund.schemeCode === code ? { ...h, alloc: Math.max(0, Math.min(100, v)) } : h));
  const autoBalance = () => {
    const n = holdings.length;
    if (!n) return;
    const each = Math.floor(100 / n);
    setHoldings(prev => prev.map((h, i) => ({ ...h, alloc: each + (i === 0 ? 100 - each * n : 0) })));
  };
  const swapFund = (fromCode: string, to: RankedFund) => {
    setHoldings(prev => prev.map(h => h.fund.schemeCode === fromCode ? { ...h, fund: to } : h));
  };

  const totalAlloc = holdings.reduce((s, h) => s + h.alloc, 0);
  const weights = totalAlloc > 0 ? holdings.map(h => h.alloc / totalAlloc) : holdings.map(() => 1 / Math.max(holdings.length, 1));

  const metrics = useMemo(() => computeMetrics(holdings, weights), [holdings, weights]); // eslint-disable-line

  const catExposure = useMemo((): [string, number][] => {
    const map = new Map<string, number>();
    holdings.forEach((h, i) => {
      const cat = h.fund.poolCategory;
      map.set(cat, (map.get(cat) ?? 0) + weights[i] * 100);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [holdings, weights]); // eslint-disable-line

  const suggestions = useMemo(() =>
    generateSuggestions(holdings, weights, allFunds, catExposure, metrics),
    [holdings, weights, allFunds, catExposure, metrics] // eslint-disable-line
  );

  // Diversification score (0-100)
  const diversificationScore = useMemo(() => {
    if (holdings.length === 0) return null;
    const nCats = catExposure.length;
    const maxAlloc = Math.max(...catExposure.map(([, p]) => p));
    const catScore = Math.min(100, nCats * 20);
    const concScore = Math.max(0, 100 - Math.max(0, maxAlloc - 30) * 2);
    const countScore = Math.min(100, holdings.length * 15);
    return Math.round((catScore * 0.4 + concScore * 0.4 + countScore * 0.2));
  }, [holdings, catExposure]); // eslint-disable-line

  const copyText = () => {
    const lines = [
      "QuantFund Portfolio Summary",
      "===========================",
      "",
      "Holdings:",
      ...holdings.map((h, i) => `  ${(weights[i] * 100).toFixed(1).padStart(5)}%  ${h.fund.schemeName} (${h.fund.poolCategory}) — Score: ${h.fund.finalScore?.toFixed(0) ?? "—"}`),
      "",
      `Weighted Metrics:`,
      `  Fund Score:     ${metrics.fundScore?.toFixed(1) ?? "—"} / 100`,
      `  Confidence:     ${metrics.confidence?.toFixed(1) ?? "—"} / 100`,
      `  3Y CAGR:        ${metrics.cagr3y != null ? fmtPct(metrics.cagr3y, { signed: true }) : "—"}`,
      `  5Y CAGR:        ${metrics.cagr5y != null ? fmtPct(metrics.cagr5y, { signed: true }) : "—"}`,
      `  Rolling 3Y Avg: ${metrics.rolling3y != null ? fmtPct(metrics.rolling3y, { signed: true }) : "—"}`,
      `  Sharpe Ratio:   ${metrics.sharpe?.toFixed(2) ?? "—"}`,
      `  Max Drawdown:   ${metrics.maxDD != null ? fmtPct(metrics.maxDD) : "—"}`,
      `  Diversification Score: ${diversificationScore ?? "—"} / 100`,
      "",
      "Category Exposure:",
      ...catExposure.map(([cat, pct]) => `  ${cat.padEnd(28)} ${pct.toFixed(1)}%`),
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (allFunds.length === 0) return (
    <AppShell title="Portfolio Analyzer">
      <div className="mx-auto max-w-lg py-28 text-center">
        <Briefcase className="mx-auto mb-5 h-10 w-10 text-muted-foreground opacity-25" />
        <h2 className="font-display text-lg font-bold">No scored funds yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Visit Dashboard first to score the full fund universe.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background hover:opacity-90">
          Go to Dashboard →
        </Link>
      </div>
    </AppShell>
  );

  const scoreGrade = (s: number | null) => {
    if (s == null) return { label: "—", color: "text-muted-foreground" };
    if (s >= 80) return { label: "Excellent", color: "text-positive" };
    if (s >= 65) return { label: "Good", color: "text-positive" };
    if (s >= 50) return { label: "Average", color: "text-warning" };
    return { label: "Weak", color: "text-negative" };
  };

  const divGrade = scoreGrade(diversificationScore);

  return (
    <AppShell title="Portfolio Analyzer">
      <div className="mx-auto max-w-[1300px] space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Briefcase className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold">Portfolio Analyzer</h1>
              {holdings.length > 0 && (
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {holdings.length}/10 funds
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Weighted metrics · diversification score · optimization suggestions
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FundSearch onAdd={addFund} added={new Set(holdings.map(h => h.fund.schemeCode))} allFunds={allFunds} />
            {holdings.length >= 2 && (
              <button onClick={autoBalance} title="Equal-weight all funds" className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                <ArrowUpDown className="h-3 w-3" /> Balance
              </button>
            )}
            {holdings.length > 0 && (
              <>
                <button onClick={copyText} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Export"}
                </button>
                <button onClick={() => setHoldings([])} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  <RefreshCw className="h-3 w-3" /> Reset
                </button>
              </>
            )}
          </div>
        </div>

        {holdings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-28">
            <Briefcase className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Build your portfolio — add up to 10 funds</p>
            <p className="font-mono text-[9px] text-muted-foreground opacity-50">{allFunds.length.toLocaleString()} scored funds available to add</p>
          </div>
        ) : (
          <>
            {/* ── Portfolio health bar ── */}
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  { label: "Fund Score", value: metrics.fundScore != null ? fmtNum(metrics.fundScore, 1) : "—", sub: scoreGrade(metrics.fundScore).label, color: toneClass(metrics.fundScore, 50, 70), icon: "📊" },
                  { label: "Diversification", value: diversificationScore != null ? `${diversificationScore}` : "—", sub: divGrade.label, color: divGrade.color, icon: "🔀" },
                  { label: "Wtd. Sharpe", value: metrics.sharpe != null ? fmtNum(metrics.sharpe, 2) : "—", sub: metrics.sharpe != null ? (metrics.sharpe >= 1 ? "Good" : metrics.sharpe >= 0.5 ? "Average" : "Weak") : "—", color: toneClass(metrics.sharpe, 0.5, 1.0), icon: "⚖️" },
                  { label: "Max Drawdown", value: metrics.maxDD != null ? fmtPct(metrics.maxDD) : "—", sub: metrics.maxDD != null ? (metrics.maxDD >= -0.2 ? "Low risk" : metrics.maxDD >= -0.35 ? "Moderate" : "High risk") : "—", color: toneClass(metrics.maxDD, -0.35, -0.2, true), icon: "📉" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="text-2xl">{item.icon}</div>
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className={`font-mono text-xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
                      <p className={`font-mono text-[8px] ${item.color} opacity-70`}>{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* ── Left column ── */}
              <div className="space-y-4">

                {/* Holdings table */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Holdings</span>
                    <span className={`font-mono text-[10px] font-bold tabular-nums ${Math.abs(totalAlloc - 100) <= 1 ? "text-positive" : "text-warning"}`}>
                      {totalAlloc}% allocated{Math.abs(totalAlloc - 100) > 1 ? " ⚠ should equal 100%" : " ✓"}
                    </span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {holdings.map((h, i) => {
                      const wPct = totalAlloc > 0 ? h.alloc / totalAlloc * 100 : 0;
                      const score = h.fund.finalScore;
                      const isWeak = score != null && score < 50;
                      return (
                        <div key={h.fund.schemeCode} className="px-4 py-3 group">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground w-5 text-center">{i + 1}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <Link to="/fund/$id" params={{ id: h.fund.schemeCode }}
                                    className="block truncate text-[12px] font-semibold text-foreground hover:text-cyan transition-colors">
                                    {h.fund.schemeName}
                                  </Link>
                                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    <CategoryBadge cat={h.fund.poolCategory} />
                                    <span className="font-mono text-[8px] text-muted-foreground">{h.fund.amc}</span>
                                    {isWeak && <span className="font-mono text-[8px] text-warning">⚠ Low score</span>}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`font-mono text-[13px] font-bold tabular-nums ${isWeak ? "text-warning" : "text-cyan"}`}>
                                    {score != null ? fmtNum(score, 0) : "—"}
                                  </p>
                                  <p className={`font-mono text-[8px] ${h.fund.ratingColor ?? "text-muted-foreground"}`}>{h.fund.rating ?? "—"}</p>
                                </div>
                              </div>

                              {/* Allocation control */}
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setAlloc(h.fund.schemeCode, h.alloc - 5)}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground font-mono text-[11px]">−</button>
                                  <input type="number" min={0} max={100} value={h.alloc}
                                    onChange={e => setAlloc(h.fund.schemeCode, Number(e.target.value))}
                                    className="w-12 rounded border border-border bg-background px-1.5 py-1 text-center font-mono text-[11px] text-foreground focus:border-cyan/60 focus:outline-none" />
                                  <span className="font-mono text-[9px] text-muted-foreground">%</span>
                                  <button onClick={() => setAlloc(h.fund.schemeCode, h.alloc + 5)}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground font-mono text-[11px]">+</button>
                                </div>
                                {/* Allocation bar */}
                                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-border">
                                  <div className="h-full rounded-full bg-cyan/60 transition-all duration-300" style={{ width: `${wPct}%` }} />
                                </div>
                                <span className="font-mono text-[9px] text-muted-foreground w-10 text-right">{wPct.toFixed(1)}%</span>
                                <button onClick={() => removeFund(h.fund.schemeCode)}
                                  className="ml-1 text-muted-foreground hover:text-negative transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {holdings.length < 10 && (
                      <div className="px-4 py-3 font-mono text-[9px] text-muted-foreground/40">
                        <Plus className="inline h-3 w-3 mr-1" />Search above to add ({10 - holdings.length} slots left)
                      </div>
                    )}
                  </div>
                </div>

                {/* Full metrics grid */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                    <TrendingUp className="h-4 w-4 text-cyan" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Weighted Portfolio Metrics</span>
                    <span className="ml-auto font-mono text-[8px] text-muted-foreground">allocation-weighted · {holdings.length} funds</span>
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-border sm:grid-cols-5">
                    {[
                      { label: "Fund Score",    v: metrics.fundScore,   fmt: (x: number) => fmtNum(x, 1),               c: toneClass(metrics.fundScore, 50, 70), hint: "/100" },
                      { label: "Confidence",    v: metrics.confidence,  fmt: (x: number) => fmtNum(x, 1),               c: toneClass(metrics.confidence, 55, 75), hint: "/100" },
                      { label: "3Y CAGR",       v: metrics.cagr3y,     fmt: (x: number) => fmtPct(x, { signed: true }), c: toneClass(metrics.cagr3y, 0.08, 0.15), hint: "" },
                      { label: "5Y CAGR",       v: metrics.cagr5y,     fmt: (x: number) => fmtPct(x, { signed: true }), c: toneClass(metrics.cagr5y, 0.10, 0.18), hint: "" },
                      { label: "Rolling 3Y",    v: metrics.rolling3y,  fmt: (x: number) => fmtPct(x, { signed: true }), c: toneClass(metrics.rolling3y, 0.08, 0.14), hint: "" },
                      { label: "Rolling 5Y",    v: metrics.rolling5y,  fmt: (x: number) => fmtPct(x, { signed: true }), c: toneClass(metrics.rolling5y, 0.10, 0.16), hint: "" },
                      { label: "Sharpe",        v: metrics.sharpe,     fmt: (x: number) => fmtNum(x, 2),               c: toneClass(metrics.sharpe, 0.5, 1.0), hint: "" },
                      { label: "Sortino",       v: metrics.sortino,    fmt: (x: number) => fmtNum(x, 2),               c: toneClass(metrics.sortino, 0.8, 1.5), hint: "" },
                      { label: "Max Drawdown",  v: metrics.maxDD,      fmt: (x: number) => fmtPct(x),                   c: toneClass(metrics.maxDD, -0.35, -0.2, true), hint: "" },
                      { label: "Downside Cap",  v: metrics.downsideCap, fmt: (x: number) => `${x.toFixed(1)}%`,         c: toneClass(metrics.downsideCap, 100, 80, true), hint: "" },
                      { label: "Upside Cap",    v: metrics.upsideCap,  fmt: (x: number) => `${x.toFixed(1)}%`,         c: toneClass(metrics.upsideCap, 80, 100), hint: "" },
                      { label: "Info Ratio",    v: metrics.infoRatio,  fmt: (x: number) => fmtNum(x, 2),               c: toneClass(metrics.infoRatio, 0, 0.5), hint: "" },
                      { label: "Alpha",         v: metrics.alpha,      fmt: (x: number) => fmtPct(x, { signed: true }), c: toneClass(metrics.alpha, -0.02, 0.02), hint: "" },
                      { label: "Beta",          v: metrics.beta,       fmt: (x: number) => fmtNum(x, 2),               c: "text-foreground", hint: "" },
                      { label: "Std Dev",       v: metrics.stdDev,     fmt: (x: number) => fmtPct(x),                   c: toneClass(metrics.stdDev, 0.25, 0.18, true), hint: "" },
                    ].map(item => (
                      <div key={item.label} className="bg-surface/70 px-3 py-3">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                        <p className={`mt-1 font-mono text-[14px] font-bold tabular-nums ${item.v != null ? item.c : "text-muted-foreground"}`}>
                          {item.v != null ? item.fmt(item.v) : "—"}{item.v != null && item.hint ? <span className="text-[9px] text-muted-foreground font-normal">{item.hint}</span> : null}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border bg-background/40 px-4 py-1.5 font-mono text-[7px] text-muted-foreground">
                    Allocation-weighted across {holdings.length} fund{holdings.length !== 1 ? "s" : ""} · RFR = 6.5% · "—" = metric unavailable for one or more holdings
                  </div>
                </div>

                {/* Optimization suggestions */}
                {suggestions.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                      <Lightbulb className="h-4 w-4 text-cyan" />
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Optimization Suggestions</span>
                      <span className="ml-auto rounded-full bg-cyan/10 px-2 py-0.5 font-mono text-[8px] font-bold text-cyan">{suggestions.length}</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {suggestions.map((s, si) => (
                        <div key={si} className={`px-4 py-3 ${s.type === "warning" ? "bg-warning/[0.03]" : s.type === "swap" ? "bg-cyan/[0.03]" : ""}`}>
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 shrink-0 ${s.type === "warning" ? "text-warning" : s.type === "swap" ? "text-cyan" : "text-muted-foreground"}`}>
                              {s.type === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> :
                               s.type === "swap"    ? <ArrowUpDown className="h-3.5 w-3.5" /> :
                                                      <Info className="h-3.5 w-3.5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[10px] font-bold text-foreground">{s.title}</p>
                              <p className="mt-0.5 font-mono text-[9px] text-muted-foreground leading-relaxed">{s.body}</p>
                              {s.type === "swap" && s.swapTo && s.swapFrom && (
                                <div className="mt-2 flex items-center gap-3 rounded-lg border border-cyan/20 bg-cyan/[0.04] px-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-wider mb-0.5">Suggested replacement</p>
                                    <p className="truncate text-[11px] font-semibold text-foreground">{s.swapTo.schemeName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <CategoryBadge cat={s.swapTo.poolCategory} />
                                      <span className="font-mono text-[9px] text-cyan font-bold">Score {fmtNum(s.swapTo.finalScore ?? 0, 0)}</span>
                                      <span className={`font-mono text-[8px] ${s.swapTo.ratingColor ?? "text-muted-foreground"}`}>{s.swapTo.rating}</span>
                                    </div>
                                  </div>
                                  <button onClick={() => swapFund(s.swapFrom!, s.swapTo!)}
                                    className="shrink-0 flex items-center gap-1 rounded-lg border border-cyan/40 bg-cyan/10 px-2.5 py-1.5 font-mono text-[9px] font-bold text-cyan hover:bg-cyan/20 transition-colors">
                                    <ArrowUpDown className="h-3 w-3" /> Swap
                                  </button>
                                  <Link to="/fund/$id" params={{ id: s.swapTo.schemeCode }}
                                    className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                                    View <ChevronRight className="h-3 w-3" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right sidebar ── */}
              <div className="space-y-4">
                {/* Category exposure */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                    <PieChart className="h-4 w-4 text-cyan" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Category Exposure</span>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {catExposure.map(([cat, pct]) => (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <CategoryBadge cat={cat} />
                          <span className="font-mono text-[10px] font-bold tabular-nums text-foreground">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: categoryColor(cat) }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border bg-background/40 px-4 py-2 font-mono text-[8px] text-muted-foreground">
                    {catExposure.length} categor{catExposure.length === 1 ? "y" : "ies"} · target: max 40% per category
                  </div>
                </div>

                {/* Diversification score */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
                    <Shield className="h-4 w-4 text-cyan" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Risk Profile</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Diversification score bar */}
                    <div>
                      <div className="flex items-end justify-between mb-1">
                        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Diversification Score</span>
                        <span className={`font-mono text-[18px] font-bold tabular-nums ${divGrade.color}`}>{diversificationScore ?? "—"}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan/60 to-cyan transition-all duration-500"
                          style={{ width: `${diversificationScore ?? 0}%` }} />
                      </div>
                      <p className={`mt-1 font-mono text-[8px] ${divGrade.color}`}>{divGrade.label}</p>
                    </div>

                    {/* Risk checklist */}
                    <div className="space-y-2">
                      {[
                        { label: "Categories", check: catExposure.length >= 3, detail: `${catExposure.length} distinct categories` },
                        { label: "Max concentration", check: Math.max(...catExposure.map(([,p]) => p), 0) <= 50, detail: `${Math.max(...catExposure.map(([,p]) => p), 0).toFixed(0)}% max in one category` },
                        { label: "Fund count", check: holdings.length >= 3, detail: `${holdings.length} funds` },
                        { label: "Drawdown control", check: metrics.maxDD != null && metrics.maxDD >= -0.35, detail: metrics.maxDD != null ? fmtPct(metrics.maxDD) : "—" },
                        { label: "Avg quality", check: metrics.fundScore != null && metrics.fundScore >= 60, detail: `Fund Score ${metrics.fundScore?.toFixed(0) ?? "—"}` },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${row.check ? "bg-positive" : "bg-negative"}`} />
                            <span className="font-mono text-[9px] text-muted-foreground">{row.label}</span>
                          </div>
                          <span className={`font-mono text-[9px] font-semibold ${row.check ? "text-positive" : "text-negative"}`}>{row.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fund ranking within portfolio */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="border-b border-border bg-background/60 px-4 py-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Fund Ranking</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {[...holdings]
                      .sort((a, b) => (b.fund.finalScore ?? -1) - (a.fund.finalScore ?? -1))
                      .map((h, i) => {
                        const wPct = totalAlloc > 0 ? h.alloc / totalAlloc * 100 : 0;
                        return (
                          <div key={h.fund.schemeCode} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={`font-mono text-[9px] font-bold w-4 ${i === 0 ? "text-cyan" : "text-muted-foreground"}`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] font-semibold text-foreground">{h.fund.schemeName}</p>
                              <p className="font-mono text-[7px] text-muted-foreground">{h.fund.poolCategory} · {wPct.toFixed(1)}% alloc</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`font-mono text-[12px] font-bold ${h.fund.ratingColor ?? "text-muted-foreground"}`}>
                                {h.fund.finalScore != null ? fmtNum(h.fund.finalScore, 0) : "—"}
                              </p>
                              <p className={`font-mono text-[7px] ${h.fund.ratingColor ?? "text-muted-foreground"}`}>{h.fund.rating ?? "—"}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
