/**
 * portfolio.tsx — Fully Functional Portfolio Analyzer
 *
 * Users can build a portfolio of up to 10 funds with custom allocations:
 *   - Search and add funds from the scored universe
 *   - Set allocation % per fund (auto-normalises to 100%)
 *   - Weighted aggregate metrics: Fund Score, Confidence, CAGR, Sharpe, Sortino, Max DD, Rolling 3Y
 *   - Category exposure donut (text-based allocation breakdown)
 *   - Correlation warning (if two funds share same category with large allocation)
 *   - Export portfolio as text summary
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Briefcase, Search, X, Plus, TrendingUp, Shield,
  PieChart, AlertTriangle, Copy, Check,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getFullRankedList, subscribeToRankedList, type RankedFund } from "@/lib/fund-store";
import { fmtPct, fmtNum } from "@/lib/format";
import { categoryColor } from "@/lib/categories";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio Analyzer — QuantFund" },
      { name: "description", content: "Analyze your mutual fund portfolio: weighted scores, category exposure, risk summary." },
    ],
  }),
  component: Portfolio,
});

interface Holding {
  fund: RankedFund;
  alloc: number; // raw user input; normalized to 100% for calculations
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{ backgroundColor: color + "22", borderColor: color + "66", color }}
      className="rounded-md border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider whitespace-nowrap font-semibold">
      {cat}
    </span>
  );
}

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
    <div ref={ref} className="relative flex-1 max-w-sm">
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
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {results.map(f => (
            <button key={f.schemeCode} onClick={() => { onAdd(f); setQ(""); setOpen(false); }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cyan/[0.07] border-b border-border/50 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-foreground">{f.schemeName}</p>
                <p className="font-mono text-[9px] text-muted-foreground">{f.amc} · {f.poolCategory}</p>
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

function weighted(holdings: Holding[], weights: number[], get: (f: RankedFund) => number | null): number | null {
  let sum = 0, totalW = 0;
  for (let i = 0; i < holdings.length; i++) {
    const v = get(holdings[i].fund);
    if (v == null) continue;
    sum += v * weights[i];
    totalW += weights[i];
  }
  return totalW > 0 ? sum / totalW : null;
}

function Portfolio() {
  const [allFunds, setAllFunds] = useState<RankedFund[]>(getFullRankedList);
  useEffect(() => subscribeToRankedList(() => setAllFunds(getFullRankedList())), []);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [copied, setCopied] = useState(false);

  const addFund = (f: RankedFund) => {
    if (holdings.length >= 10 || holdings.find(h => h.fund.schemeCode === f.schemeCode)) return;
    setHoldings(prev => [...prev, { fund: f, alloc: Math.round(100 / (prev.length + 1)) }]);
  };

  const removeFund = (code: string) => setHoldings(prev => prev.filter(h => h.fund.schemeCode !== code));

  const setAlloc = (code: string, v: number) => {
    setHoldings(prev => prev.map(h => h.fund.schemeCode === code ? { ...h, alloc: Math.max(0, Math.min(100, v)) } : h));
  };

  const autoBalance = () => {
    const n = holdings.length;
    if (n === 0) return;
    const each = Math.floor(100 / n);
    const rem = 100 - each * n;
    setHoldings(prev => prev.map((h, i) => ({ ...h, alloc: each + (i === 0 ? rem : 0) })));
  };

  // Normalize allocations to sum to 100%
  const totalAlloc = holdings.reduce((s, h) => s + h.alloc, 0);
  const weights = totalAlloc > 0 ? holdings.map(h => h.alloc / totalAlloc) : holdings.map(() => 1 / holdings.length);

  // Weighted aggregate metrics
  const metrics = useMemo(() => ({
    fundScore:   weighted(holdings, weights, f => f.finalScore),
    confidence:  weighted(holdings, weights, f => f.confidenceScore),
    cagr3y:      weighted(holdings, weights, f => f.metrics.cagr3y),
    cagr5y:      weighted(holdings, weights, f => f.metrics.cagr5y),
    rolling3y:   weighted(holdings, weights, f => f.metrics.rollingReturn3yAvg),
    sharpe:      weighted(holdings, weights, f => f.metrics.sharpe),
    sortino:     weighted(holdings, weights, f => f.metrics.sortino),
    maxDD:       weighted(holdings, weights, f => f.metrics.maxDrawdown),
    infoRatio:   weighted(holdings, weights, f => f.metrics.informationRatio),
    beta:        weighted(holdings, weights, f => f.metrics.beta),
  }), [holdings, weights]); // eslint-disable-line react-hooks/exhaustive-deps

  // Category exposure
  const catExposure = useMemo(() => {
    const map = new Map<string, number>();
    holdings.forEach((h, i) => {
      const cat = h.fund.poolCategory;
      map.set(cat, (map.get(cat) ?? 0) + weights[i] * 100);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [holdings, weights]); // eslint-disable-line react-hooks/exhaustive-deps

  // Concentration warning: >50% in one category
  const concentrationWarning = catExposure.find(([, pct]) => pct > 50);

  const copyPortfolio = () => {
    const lines = [
      "QuantFund Portfolio Summary",
      "===========================",
      "",
      ...holdings.map((h, i) => `${(weights[i] * 100).toFixed(1).padStart(5)}%  ${h.fund.schemeName} (${h.fund.poolCategory}) — Score: ${h.fund.finalScore?.toFixed(1) ?? "—"}`),
      "",
      "Weighted Portfolio Metrics:",
      `  Fund Score:    ${metrics.fundScore?.toFixed(1) ?? "—"}`,
      `  3Y CAGR:       ${metrics.cagr3y != null ? fmtPct(metrics.cagr3y, { signed: true }) : "—"}`,
      `  Sharpe Ratio:  ${metrics.sharpe?.toFixed(2) ?? "—"}`,
      `  Sortino Ratio: ${metrics.sortino?.toFixed(2) ?? "—"}`,
      `  Max Drawdown:  ${metrics.maxDD != null ? fmtPct(metrics.maxDD) : "—"}`,
      "",
      "Category Exposure:",
      ...catExposure.map(([cat, pct]) => `  ${cat.padEnd(25)} ${pct.toFixed(1)}%`),
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (allFunds.length === 0) {
    return (
      <AppShell title="Portfolio Analyzer">
        <div className="mx-auto max-w-xl py-24 text-center">
          <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
          <h2 className="font-display text-lg font-bold text-foreground">No data yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Portfolio reads from Dashboard. Visit Dashboard first to score all funds.</p>
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background transition-opacity hover:opacity-90">
            Load on Dashboard →
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Portfolio Analyzer">
      <div className="mx-auto max-w-[1200px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Briefcase className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Portfolio Analyzer</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Weighted aggregate metrics across your holdings · Up to 10 funds
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FundSearch onAdd={addFund} added={new Set(holdings.map(h => h.fund.schemeCode))} allFunds={allFunds} />
            {holdings.length >= 2 && (
              <button onClick={autoBalance} className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Auto-balance
              </button>
            )}
            {holdings.length > 0 && (
              <button onClick={copyPortfolio} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy summary"}
              </button>
            )}
          </div>
        </div>

        {holdings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/40 py-24 text-center">
            <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-20" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Search and add up to 10 funds to analyze your portfolio</p>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground opacity-60">{allFunds.length.toLocaleString()} scored funds available</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            {/* Left: holdings table + metrics */}
            <div className="space-y-4">
              {/* Holdings input */}
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="border-b border-border bg-background/60 px-4 py-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Holdings</span>
                  <span className={`font-mono text-[10px] tabular-nums ${Math.abs(totalAlloc - 100) < 1 ? "text-positive" : "text-warning"}`}>
                    Total: {totalAlloc}%
                    {Math.abs(totalAlloc - 100) > 1 && " ⚠"}
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {holdings.map((h, i) => {
                    const wPct = totalAlloc > 0 ? (h.alloc / totalAlloc * 100) : 0;
                    return (
                      <div key={h.fund.schemeCode} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <Link to="/fund/$id" params={{ id: h.fund.schemeCode }}
                            className="block truncate text-[12px] font-semibold text-foreground hover:text-cyan transition-colors">
                            {h.fund.schemeName}
                          </Link>
                          <div className="mt-1 flex items-center gap-2">
                            <CategoryBadge cat={h.fund.poolCategory} />
                            {h.fund.finalScore != null && (
                              <span className="font-mono text-[9px] text-cyan font-bold">Score {fmtNum(h.fund.finalScore, 0)}</span>
                            )}
                          </div>
                          {/* Allocation bar */}
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
                            <div className="h-full rounded-full bg-cyan/60 transition-all duration-300" style={{ width: `${wPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setAlloc(h.fund.schemeCode, h.alloc - 5)}
                              className="h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center font-mono text-[10px] transition-colors">−</button>
                            <input
                              type="number" min={0} max={100} value={h.alloc}
                              onChange={e => setAlloc(h.fund.schemeCode, Number(e.target.value))}
                              className="w-14 rounded border border-border bg-background px-2 py-1 text-center font-mono text-[11px] text-foreground focus:border-cyan/60 focus:outline-none"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">%</span>
                            <button onClick={() => setAlloc(h.fund.schemeCode, h.alloc + 5)}
                              className="h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center font-mono text-[10px] transition-colors">+</button>
                          </div>
                          <button onClick={() => removeFund(h.fund.schemeCode)}
                            className="text-muted-foreground hover:text-negative transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {holdings.length < 10 && (
                    <div className="px-4 py-3 font-mono text-[10px] text-muted-foreground/50">
                      <Plus className="inline h-3 w-3 mr-1" />Search above to add more funds ({10 - holdings.length} slots remaining)
                    </div>
                  )}
                </div>
              </div>

              {/* Concentration warning */}
              {concentrationWarning && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                  <div>
                    <p className="font-mono text-[10px] font-bold text-warning uppercase tracking-wider">Concentration Risk</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {concentrationWarning[0]} accounts for {concentrationWarning[1].toFixed(1)}% of your portfolio.
                      Consider diversifying across different fund categories.
                    </p>
                  </div>
                </div>
              )}

              {/* Weighted portfolio metrics */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="border-b border-border bg-background/60 px-4 py-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Weighted Portfolio Metrics</span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">allocation-weighted across {holdings.length} fund{holdings.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: "Fund Score", value: metrics.fundScore, fmt: (v: number) => fmtNum(v, 1), color: "text-cyan" },
                    { label: "Confidence", value: metrics.confidence, fmt: (v: number) => fmtNum(v, 1), color: "text-foreground" },
                    { label: "3Y CAGR", value: metrics.cagr3y, fmt: (v: number) => fmtPct(v, { signed: true }), color: metrics.cagr3y != null && metrics.cagr3y >= 0 ? "text-positive" : "text-negative" },
                    { label: "5Y CAGR", value: metrics.cagr5y, fmt: (v: number) => fmtPct(v, { signed: true }), color: metrics.cagr5y != null && metrics.cagr5y >= 0 ? "text-positive" : "text-negative" },
                    { label: "Rolling 3Y", value: metrics.rolling3y, fmt: (v: number) => fmtPct(v, { signed: true }), color: metrics.rolling3y != null && metrics.rolling3y >= 0 ? "text-positive" : "text-negative" },
                    { label: "Sharpe", value: metrics.sharpe, fmt: (v: number) => fmtNum(v, 2), color: metrics.sharpe != null && metrics.sharpe >= 1 ? "text-positive" : "text-foreground" },
                    { label: "Sortino", value: metrics.sortino, fmt: (v: number) => fmtNum(v, 2), color: metrics.sortino != null && metrics.sortino >= 1.5 ? "text-positive" : "text-foreground" },
                    { label: "Max Drawdown", value: metrics.maxDD, fmt: (v: number) => fmtPct(v), color: metrics.maxDD != null && metrics.maxDD >= -0.2 ? "text-positive" : "text-negative" },
                    { label: "Info Ratio", value: metrics.infoRatio, fmt: (v: number) => fmtNum(v, 2), color: metrics.infoRatio != null && metrics.infoRatio >= 0.5 ? "text-positive" : "text-foreground" },
                    { label: "Beta", value: metrics.beta, fmt: (v: number) => fmtNum(v, 2), color: "text-foreground" },
                  ].map(item => (
                    <div key={item.label} className="bg-surface/80 px-4 py-3">
                      <p className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className={`mt-1 font-display text-lg font-bold tabular-nums ${item.value != null ? item.color : "text-muted-foreground"}`}>
                        {item.value != null ? item.fmt(item.value) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border bg-background/40 px-4 py-2 font-mono text-[8px] text-muted-foreground">
                  All metrics allocation-weighted · "—" = insufficient data for one or more holdings
                </div>
              </div>
            </div>

            {/* Right: category exposure + risk summary */}
            <div className="space-y-4">
              {/* Category exposure */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="border-b border-border bg-background/60 px-4 py-3 flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Category Exposure</span>
                </div>
                <div className="p-4 space-y-2">
                  {catExposure.map(([cat, pct]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <CategoryBadge cat={cat} />
                        <span className="font-mono text-[10px] font-bold text-foreground tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: categoryColor(cat) }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border bg-background/40 px-4 py-2 font-mono text-[8px] text-muted-foreground">
                  {catExposure.length} categor{catExposure.length === 1 ? "y" : "ies"} · {holdings.length} fund{holdings.length !== 1 ? "s" : ""}
                </div>
              </div>

              {/* Risk summary */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="border-b border-border bg-background/60 px-4 py-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Portfolio Risk Profile</span>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    {
                      label: "Diversification",
                      value: catExposure.length >= 3 ? "Good" : catExposure.length === 2 ? "Moderate" : "Low",
                      color: catExposure.length >= 3 ? "text-positive" : catExposure.length === 2 ? "text-warning" : "text-negative",
                      desc: `${catExposure.length} distinct categories`,
                    },
                    {
                      label: "Wtd. Max Drawdown",
                      value: metrics.maxDD != null ? fmtPct(metrics.maxDD) : "—",
                      color: metrics.maxDD != null && metrics.maxDD >= -0.25 ? "text-positive" : "text-negative",
                      desc: "Portfolio-level worst loss",
                    },
                    {
                      label: "Wtd. Sharpe Ratio",
                      value: metrics.sharpe != null ? fmtNum(metrics.sharpe, 2) : "—",
                      color: metrics.sharpe != null && metrics.sharpe >= 1 ? "text-positive" : metrics.sharpe != null && metrics.sharpe >= 0.5 ? "text-warning" : "text-negative",
                      desc: "Risk-adjusted return quality",
                    },
                    {
                      label: "Wtd. Fund Score",
                      value: metrics.fundScore != null ? fmtNum(metrics.fundScore, 1) : "—",
                      color: metrics.fundScore != null && metrics.fundScore >= 70 ? "text-positive" : metrics.fundScore != null && metrics.fundScore >= 50 ? "text-warning" : "text-negative",
                      desc: "QuantFund category-relative quality",
                    },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                        <p className="font-mono text-[8px] text-muted-foreground/60">{item.desc}</p>
                      </div>
                      <span className={`font-mono text-[14px] font-bold tabular-nums ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Individual fund scores */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="border-b border-border bg-background/60 px-4 py-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">Fund Scores</span>
                </div>
                <div className="divide-y divide-border/50">
                  {[...holdings].sort((a, b) => (b.fund.finalScore ?? -1) - (a.fund.finalScore ?? -1)).map((h, i) => (
                    <div key={h.fund.schemeCode} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-[9px] text-muted-foreground w-4">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-foreground">{h.fund.schemeName}</p>
                        <p className="font-mono text-[8px] text-muted-foreground">{h.fund.poolCategory} · {(totalAlloc > 0 ? h.alloc / totalAlloc * 100 : 0).toFixed(1)}% alloc</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[12px] font-bold text-cyan">{h.fund.finalScore != null ? fmtNum(h.fund.finalScore, 0) : "—"}</p>
                        <p className={`font-mono text-[8px] ${h.fund.ratingColor ?? "text-muted-foreground"}`}>{h.fund.rating ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
