import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertCircle, Loader2, Info, Trophy, CheckCircle2 } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, type QuantFundCategory } from "@/lib/categories";
import { fetchNavHistory } from "@/lib/nav-history";
import { computeFundMetrics, quantFundScore } from "@/lib/fund-metrics";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "Category-scoped mutual fund leaderboards powered by the QuantFund Score — no invalid cross-category comparisons." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:description", content: "Top Indian mutual funds ranked within each category by QuantFund Score." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
  component: Rankings,
});

type BroadTab = "Equity" | "Hybrid" | "Debt" | "Index / ETF" | "Gold & Intl";

const BROAD_TABS: BroadTab[] = ["Equity", "Hybrid", "Debt", "Index / ETF", "Gold & Intl"];

const CATEGORIES_BY_BROAD: Record<BroadTab, QuantFundCategory[]> = {
  Equity: [
    "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap",
    "Large & Mid Cap", "ELSS", "Focused", "Sectoral / Thematic", "Dividend Yield",
  ],
  Hybrid: [
    "Aggressive Hybrid", "Conservative Hybrid", "Balanced Advantage",
    "Multi Asset", "Arbitrage",
  ],
  Debt: [
    "Short Duration", "Medium Duration", "Long Duration", "Dynamic Bond",
    "Corporate Bond", "Credit Risk", "Banking & PSU", "Gilt",
    "Liquid", "Ultra Short Duration", "Low Duration", "Money Market", "Floater",
  ],
  "Index / ETF": ["Index Fund", "ETF"],
  "Gold & Intl": ["Gold", "International / FoF"],
};

const TOP_N = 25;

type Row = AMFIScheme & {
  score: number | null; ret1y: number | null; cagr3y: number | null;
  sharpe: number | null; maxDD: number | null;
};

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-20 hidden w-60 rounded-xl border border-border bg-surface p-2.5 text-[10px] normal-case tracking-normal text-foreground shadow-xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function Rankings() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeTab, setActiveTab] = useState<BroadTab>("Equity");
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
    // Do NOT pre-slice here — fetch all candidates so the top-N after scoring
    // reflects the genuinely best funds, not the first N by AMFI code order.
    return direct.length >= 10 ? direct : inCat;
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

  const ranked = useMemo((): Row[] => {
    const rows: Row[] = candidates.map((s, i) => {
      const history = navQueries[i]?.data;
      if (!history) return { ...s, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null };
      const m = computeFundMetrics(history.series);
      return { ...s, score: quantFundScore(m), ret1y: m.ret1y, cagr3y: m.cagr3y, sharpe: m.sharpe, maxDD: m.maxDrawdown };
    });
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return rows;
  }, [candidates, navQueries]);

  const handleTabChange = (tab: BroadTab) => {
    setActiveTab(tab);
    setActiveCategory(CATEGORIES_BY_BROAD[tab][0]);
  };

  if (isError) {
    return (
      <AppShell title="Rankings">
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
      <AppShell title="Rankings">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI fund universe…</p>
        </div>
      </AppShell>
    );
  }

  const asOf = allSchemes[0]?.date ?? null;

  return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-5xl space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cyan" />
              <h1 className="font-display text-2xl font-bold tracking-tight">Rankings</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Category-scoped leaderboards · {activeSchemes.length.toLocaleString()} open-ended schemes
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="Rankings are always within-category. Cross-category scores are not comparable." />
        </div>

        {/* Score formula strip */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-2.5">
          <p className="font-mono text-[10px] text-muted-foreground">
            <span className="text-cyan font-bold">QuantFund Score</span>
            {" "}— CAGR3Y <span className="text-foreground">35%</span> · Sharpe{" "}
            <span className="text-foreground">25%</span> · Max Drawdown{" "}
            <span className="text-foreground">20%</span> · Rolling Consistency{" "}
            <span className="text-foreground">20%</span> · Real NAV history · Not AI
          </p>
        </div>

        {/* Broad tabs */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {BROAD_TABS.map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab)}
              className={`shrink-0 rounded-lg px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-150 ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Sub-category pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {CATEGORIES_BY_BROAD[activeTab].map((cat) => {
            const count = activeSchemes.filter((s) => classifyAMFICategory(s.category) === cat).length;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-150 ${
                  cat === activeCategory
                    ? "bg-cyan text-background shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                    : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                }`}>
                {cat}
                <span className="ml-1.5 opacity-50">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
              Top Ranked — {activeCategory}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {allReady ? (
                <><CheckCircle2 className="h-3 w-3 text-positive" />{navLoaded} scored</>
              ) : (
                <><Loader2 className="h-3 w-3 animate-spin" />Scoring {navLoaded}/{navTotal}</>
              )}
              <InfoTooltip text={`Top ${TOP_N} Direct-Growth schemes scored from real NAV history. Cached 12h per fund.`} />
            </span>
          </div>

          {candidates.length === 0 ? (
            <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              No schemes in {activeCategory}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-background/90 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    <th className="p-3 font-medium">Rk</th>
                    <th className="p-3 font-medium">Scheme</th>
                    <th className="p-3 text-right font-medium">Score</th>
                    <th className="p-3 text-right font-medium">1Y Ret</th>
                    <th className="p-3 text-right font-medium">3Y CAGR</th>
                    <th className="p-3 text-right font-medium">Sharpe</th>
                    <th className="p-3 text-right font-medium">Max DD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
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

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Rankings are always within the selected category. Cross-category comparison is invalid — equity and debt
          funds operate under fundamentally different return and risk profiles.
          Top {TOP_N} Direct-Growth schemes per category are scored from real AMFI NAV history.
          Data: {" "}
          <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">AMFI</a>
          {" "}&{" "}
          <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>.
          Last updated: {asOf ?? "—"}.
        </p>
      </div>
    </AppShell>
  );
}
