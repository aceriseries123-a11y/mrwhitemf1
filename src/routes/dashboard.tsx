/**
 * dashboard.tsx — Overview: top-ranked funds per SEBI category.
 * All metrics are computed from real AMFI + mfapi.in NAV history.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, TrendingUp, Layers,
  CheckCircle2, Star, BarChart2, Activity,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import { classifyAMFICategory, type QuantFundCategory } from "../lib/categories";
import { fetchNavHistory } from "../lib/nav-history";
import { computeFundMetrics, quantFundScore } from "../lib/fund-metrics";
import { fmtPct, fmtNum } from "../lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      { name: "description", content: "Top-ranked Indian mutual funds by SEBI category. Every metric is computed from real AMFI NAV history — no synthetic scores." },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Quant rankings computed from real NAV history." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

const DASHBOARD_CATEGORIES: QuantFundCategory[] = [
  "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap",
  "ELSS", "Aggressive Hybrid", "Short Duration",
];

const TOP_N = 25;

function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeCategory, setActiveCategory] = useState<QuantFundCategory>("Large Cap");

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  const candidates = useMemo(() => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    const direct = inCat.filter((s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName));
    const pool = direct.length >= 10 ? direct : inCat;
    return pool.slice(0, TOP_N);
  }, [activeSchemes, activeCategory]);

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

  const ranked = useMemo(() => {
    type Row = AMFIScheme & {
      score: number | null; ret1y: number | null; cagr3y: number | null;
      sharpe: number | null; maxDD: number | null;
    };
    const rows: Row[] = candidates.map((s, i) => {
      const history = navQueries[i]?.data;
      if (!history) return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null };
      const m = computeFundMetrics(history.series);
      return { ...s, score: quantFundScore(m), ret1y: m.ret1y, cagr3y: m.cagr3y, sharpe: m.sharpe, maxDD: m.maxDrawdown };
    });
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return rows.slice(0, 10);
  }, [candidates, navQueries]);

  const medianRet = useMemo(() => {
    const arr = ranked.map((r) => r.ret1y).filter((v): v is number => v != null).sort((a, b) => a - b);
    return arr.length ? arr[Math.floor(arr.length / 2)] : null;
  }, [ranked]);

  if (isError) {
    return (
      <AppShell title="Dashboard">
        <div className="mx-auto max-w-4xl">
          <div className="flex gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
            <div>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">Fund data unavailable</h2>
              <p className="mb-2 text-sm text-muted-foreground">Rankings cannot be displayed — AMFI data source is currently unreachable.</p>
              <p className="font-mono text-xs text-negative/70">{(error as Error)?.message ?? "Unknown error"}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Dashboard">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI fund universe…</p>
        </div>
      </AppShell>
    );
  }

  const universeSize = activeSchemes.length;
  const asOf = allSchemes[0]?.date ?? null;

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {universeSize.toLocaleString()} open-ended schemes · Rankings within category
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf} note="NAV updates once daily after market close." />
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={TrendingUp} label="Median 1Y Ret"
            value={medianRet != null ? fmtPct(medianRet, { signed: true }) : "—"}
            tone={medianRet != null ? (medianRet >= 0 ? "positive" : "negative") : undefined} />
          <KpiTile icon={Layers} label="Universe" value={universeSize.toLocaleString()} />
          <KpiTile
            icon={allReady ? CheckCircle2 : Activity}
            label="Scored"
            value={`${navLoaded}/${navTotal}`}
            suffix={allReady ? "ready" : "loading"}
            tone={allReady ? "positive" : undefined} />
          <KpiTile icon={Star} label="Top Score"
            value={ranked[0]?.score != null ? fmtNum(ranked[0].score, 1) : "—"}
            tone="cyan" />
        </div>

        {/* Category pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {DASHBOARD_CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-150 ${
                  active
                    ? "bg-cyan text-background shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "border border-border bg-surface text-muted-foreground hover:border-cyan/50 hover:text-foreground"
                }`}>
                {cat}
              </button>
            );
          })}
        </div>

        {/* Ranked table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-3.5 w-3.5 text-cyan" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan">
                Top Ranked — {activeCategory}
              </span>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {allReady ? (
                <><CheckCircle2 className="h-3 w-3 text-positive" /> {navLoaded} scored</>
              ) : (
                <><Loader2 className="h-3 w-3 animate-spin" /> Scoring {navLoaded}/{navTotal}</>
              )}
              <InfoTooltip text={`Top ${TOP_N} Direct-Growth schemes are scored from real NAV history. Results are cached for 12h.`} />
            </span>
          </div>

          {candidates.length === 0 ? (
            <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              No schemes found in {activeCategory}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    <th className="p-3 font-medium">Rk</th>
                    <th className="p-3 font-medium">Scheme</th>
                    <th className="p-3 text-right font-medium">Score</th>
                    <th className="p-3 text-right font-medium">1Y</th>
                    <th className="p-3 text-right font-medium">3Y CAGR</th>
                    <th className="p-3 text-right font-medium">Sharpe</th>
                    <th className="p-3 text-right font-medium">Max DD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ranked.map((s, idx) => {
                    const isTop3 = idx < 3;
                    return (
                      <tr key={s.schemeCode}
                        className={`group transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.02]" : ""}`}>
                        <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                          <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                        </td>
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
                                <div className="h-full rounded-full bg-cyan transition-all duration-500"
                                  style={{ width: `${Math.min(100, s.score)}%` }} />
                              </div>
                            </div>
                          ) : navQueries[idx]?.isLoading ? (
                            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground">—</span>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">QuantFund Score</span> is a transparent composite of CAGR (35%), Sharpe (25%),
          Max Drawdown (20%) and 1Y rolling positive rate (20%) — computed from real NAV history. Not AI, not a prediction.
          NAV data from{" "}
          <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI India</a>
          {" "}and{" "}
          <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Market ticks (NIFTY 50, SENSEX, Gold, USD/INR) via Yahoo Finance — displayed in the ticker bar above.
        </p>
      </div>
    </AppShell>
  );
}

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function KpiTile({
  icon: Icon, label, value, suffix, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  suffix?: string;
  tone?: "positive" | "negative" | "cyan";
}) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : tone === "cyan" ? "text-cyan" : "text-foreground";
  const iconClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : tone === "cyan" ? "text-cyan" : "text-muted-foreground";
  return (
    <div className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border/80 hover:bg-surface-elevated">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${iconClass} opacity-70`} />
      </div>
      <p className={`font-display text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
        {suffix && (
          <span className="ml-1.5 font-mono text-[9px] font-medium uppercase tracking-widest text-muted-foreground">{suffix}</span>
        )}
      </p>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tip relative" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-20 hidden w-60 rounded-lg border border-border bg-surface p-2.5 text-[10px] normal-case tracking-normal text-foreground shadow-xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}
