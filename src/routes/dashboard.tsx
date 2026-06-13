/**
 * dashboard.tsx
 *
 * TABLE 1 — Overall Top 10 (Advanced cross-category score)
 *   Pool: ALL Direct-Growth schemes across EVERY recognised AMFI category.
 *   No per-category or total cap. Each fund's metrics are memoised so the
 *   percentile recomputation on each new arrival is O(n), not O(n²).
 *   6 factors, all percentile-ranked within the full loaded pool:
 *     Sharpe 28 · Sortino 22 · Calmar 20 · CAGR3Y 15 · Rolling+ 10 · MaxDD 5
 *
 * TABLE 2 — Category Top 10 (QuantFund Score within category)
 *   Pool: ALL active Growth plans (Direct + Regular) in the selected category.
 *   No count cap. Direct plans are badged for clarity.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle, Loader2, Info, TrendingUp, Layers,
  CheckCircle2, Star, BarChart2, Activity, Medal,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import {
  classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory,
} from "../lib/categories";
import { fetchNavHistory, type NavHistory } from "../lib/nav-history";
import {
  computeFundMetrics, quantFundScore, calmarRatio,
  advancedPoolScore, type FundMetrics, type PoolFundData,
} from "../lib/fund-metrics";
import { fmtPct, fmtNum } from "../lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      {
        name: "description",
        content:
          "Full-universe fund rankings — all AMFI Direct-Growth schemes across every category, scored with a 6-factor percentile-normalised Advanced Score.",
      },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Full-universe quant rankings from real NAV history." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

// ─── Pool config ──────────────────────────────────────────────────────────────
// Every recognised AMFI category (excluding "Unknown") participates in the
// overall pool. No count cap — every Direct-Growth scheme in every category
// is fetched and scored.

const OVERALL_POOL_CATEGORIES = QUANTFUND_CATEGORIES.filter(
  (c) => c !== "Unknown",
) as QuantFundCategory[];

// Category picker tabs — all recognised categories
const CAT_TABS: QuantFundCategory[] = [
  // Equity
  "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap", "Large & Mid Cap",
  "ELSS", "Focused", "Sectoral / Thematic", "Dividend Yield",
  // Hybrid
  "Aggressive Hybrid", "Balanced Advantage", "Conservative Hybrid", "Arbitrage", "Multi Asset",
  // Debt
  "Liquid", "Overnight", "Ultra Short Duration", "Low Duration", "Short Duration",
  "Medium Duration", "Medium to Long Duration", "Long Duration",
  "Dynamic Bond", "Corporate Bond", "Credit Risk", "Banking & PSU",
  "Gilt", "Gilt 10Y", "Floater", "Money Market",
  // Index / ETF
  "Index Fund", "ETF",
  // International / Gold / Solution
  "International / FoF", "Gold", "Retirement", "Children",
];

const TOP_N = 10;

// LocalStorage key — includes today's date so metrics auto-expire daily
// (AMFI NAV publishes once daily so yesterday's metrics are still valid,
// but using today's date keeps the key simple and predictable).
const TODAY = new Date().toISOString().slice(0, 10);
const LS_METRICS_KEY = `qf-metrics-v2-${TODAY}`;

// ─── Types ────────────────────────────────────────────────────────────────────

type PoolEntry = AMFIScheme & { poolCategory: QuantFundCategory };

interface CachedMetrics {
  metrics: FundMetrics;
  calmar: number | null;
}

interface ScoredOverall extends CachedMetrics {
  scheme: PoolEntry;
  advScore: number | null;
}

/** "direct" = Direct plan; "regular" = Regular plan. */
type PlanBadge = "direct" | "regular";

interface CatRow extends AMFIScheme {
  badge: PlanBadge;
  score: number | null;
  ret1y: number | null;
  cagr3y: number | null;
  sharpe: number | null;
  maxDD: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive plan badge from scheme name. */
function planBadge(name: string): PlanBadge {
  return /direct/i.test(name) ? "direct" : "regular";
}

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute right-0 top-4 z-30 hidden w-72 rounded-xl border border-border bg-surface p-3 text-[10px] normal-case leading-relaxed tracking-normal text-foreground shadow-2xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-cyan transition-all duration-500"
        style={{ width: value != null ? `${Math.min(100, value)}%` : "0%" }}
      />
    </div>
  );
}

function ProgressBar({
  settled, loaded, total, label,
}: { settled: number; loaded: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const done = settled === total && total > 0;
  return (
    <div className="mb-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {done
            ? <CheckCircle2 className="h-3 w-3 text-positive" />
            : <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
          {label} — {loaded.toLocaleString()} scored
          <span className="opacity-60">/ {total.toLocaleString()} total</span>
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-positive" : "bg-cyan"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!done && settled > 0 && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Ranking updates live · {settled}/{total} settled
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeCategory, setActiveCategory] = useState<QuantFundCategory>("Large Cap");

  // Per-fund metric cache — avoids recomputing on every render as pool grows.
  const overallMetricCache = useRef<Map<string, CachedMetrics>>(new Map());
  const catMetricCache     = useRef<Map<string, CachedMetrics>>(new Map());

  // Load today's metrics from localStorage and prime the in-memory cache once.
  // Funds primed from localStorage skip NAV fetching entirely on reload.
  const lsPrimed = useRef(false);
  const localMetrics = useMemo((): Record<string, CachedMetrics> => {
    try {
      const raw = localStorage.getItem(LS_METRICS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, CachedMetrics>) : {};
    } catch { return {}; }
  }, []);
  if (!lsPrimed.current) {
    for (const [code, cm] of Object.entries(localMetrics)) {
      overallMetricCache.current.set(code, cm);
    }
    lsPrimed.current = true;
  }

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  // ── Overall pool ─────────────────────────────────────────────────────────
  // Strict Direct-Growth schemes only across every AMFI category. No fallback.

  const overallCandidates = useMemo((): PoolEntry[] => {
    if (!activeSchemes.length) return [];

    return OVERALL_POOL_CATEGORIES.flatMap((category) => {
      const inCat = activeSchemes.filter(
        (s) => classifyAMFICategory(s.category) === category,
      );
      // Strict Direct-Growth only — no IDCW, no Regular, no fallback
      const directGrowth = inCat.filter(
        (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
      );
      return directGrowth.map((s) => ({ ...s, poolCategory: category }));
    });
  }, [activeSchemes]);

  // ── Overall pool — individual browser fetches with localStorage cache ────
  // mfapi.in rate-limits server-side batch requests (shared CF Worker IP).
  // Browser fetches with high concurrency (100) are reliable and fast.
  // Computed metrics are cached in localStorage so reloads are instant.

  // Skip fetching funds whose metrics are already in localStorage
  const freshCandidates = useMemo(
    () => overallCandidates.filter((s) => !localMetrics[s.schemeCode]),
    [overallCandidates, localMetrics],
  );

  const overallNavQ = useQueries({
    queries: freshCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  // Fast map of newly-fetched NAV history (fresh this session only)
  const freshNavMap = useMemo(() => {
    const map = new Map<string, NavHistory>();
    freshCandidates.forEach((s, i) => {
      const h = overallNavQ[i]?.data;
      if (h) map.set(s.schemeCode, h);
    });
    return map;
  }, [freshCandidates, overallNavQ]);

  // Progress — cached funds count as instantly settled
  const cachedCount    = overallCandidates.length - freshCandidates.length;
  const freshSettled   = useMemo(
    () => overallNavQ.filter((q) => q.status === "success" || q.status === "error").length,
    [overallNavQ],
  );
  const freshLoaded    = useMemo(
    () => overallNavQ.filter((q) => q.status === "success").length,
    [overallNavQ],
  );
  const overallSettled = cachedCount + freshSettled;
  const overallLoaded  = cachedCount + freshLoaded;
  const overallTotal   = overallCandidates.length;
  const overallDone    = overallSettled === overallTotal && overallTotal > 0;

  // Save all computed metrics to localStorage once loading finishes
  useEffect(() => {
    if (!overallDone || overallMetricCache.current.size === 0) return;
    try {
      const obj: Record<string, CachedMetrics> = {};
      for (const [code, cm] of overallMetricCache.current) obj[code] = cm;
      localStorage.setItem(LS_METRICS_KEY, JSON.stringify(obj));
    } catch { /* quota exceeded — no-op */ }
  }, [overallDone]);

  // Progressively ranked from any combination of cached + freshly loaded metrics
  const overallRanked = useMemo((): ScoredOverall[] => {
    const pool: ScoredOverall[] = [];

    for (const s of overallCandidates) {
      let cached = overallMetricCache.current.get(s.schemeCode);
      if (!cached) {
        const history = freshNavMap.get(s.schemeCode);
        if (!history) continue;
        const metrics = computeFundMetrics(history.series);
        cached = { metrics, calmar: calmarRatio(metrics) };
        overallMetricCache.current.set(s.schemeCode, cached);
      }
      pool.push({ scheme: s, ...cached, advScore: null });
    }

    if (pool.length < 3) return [];

    const scored = pool.map((f) => ({
      ...f,
      advScore: advancedPoolScore(f, pool),
    }));
    scored.sort((a, b) => (b.advScore ?? -1) - (a.advScore ?? -1));
    return scored.slice(0, TOP_N);
  }, [overallCandidates, freshNavMap]);

  // ── Category pool ────────────────────────────────────────────────────────
  // Strict Direct-Growth plans only in the selected category. No fallback.

  const catCandidates = useMemo((): AMFIScheme[] => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    // Strict Direct-Growth only — no IDCW, no Regular, no fallback
    return inCat.filter(
      (s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName),
    );
  }, [activeSchemes, activeCategory]);

  // Reset category metric cache when category changes
  const prevCat = useRef<QuantFundCategory | null>(null);
  if (prevCat.current !== activeCategory) {
    catMetricCache.current.clear();
    prevCat.current = activeCategory;
  }

  // ── Category pool — individual browser fetches ───────────────────────────
  // Typically 30-60 funds per category → fast with direct browser fetches.

  const catNavQ = useQueries({
    queries: catCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const catSettled = useMemo(
    () => catNavQ.filter((q) => q.status === "success" || q.status === "error").length,
    [catNavQ],
  );
  const catLoaded = useMemo(
    () => catNavQ.filter((q) => q.status === "success").length,
    [catNavQ],
  );
  const catTotal = catCandidates.length;
  const catDone  = catSettled === catTotal && catTotal > 0;

  const catRanked = useMemo((): CatRow[] => {
    const rows: CatRow[] = catCandidates.map((s, i) => {
      const badge   = planBadge(s.schemeName);
      const history = catNavQ[i]?.data;
      if (!history) {
        return { ...s, badge, score: null, ret1y: null, cagr3y: null, sharpe: null, maxDD: null };
      }

      let cached = catMetricCache.current.get(s.schemeCode);
      if (!cached) {
        const metrics = computeFundMetrics(history.series);
        cached = { metrics, calmar: calmarRatio(metrics) };
        catMetricCache.current.set(s.schemeCode, cached);
      }

      const m = cached.metrics;
      return {
        ...s,
        badge,
        score:  quantFundScore(m),
        ret1y:  m.ret1y,
        cagr3y: m.cagr3y,
        sharpe: m.sharpe,
        maxDD:  m.maxDrawdown,
      };
    });
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return rows.slice(0, TOP_N);
  }, [catCandidates, catNavQ]);

  // ── KPI strip ────────────────────────────────────────────────────────────
  const topAdvScore  = overallRanked[0]?.advScore ?? null;
  const topCatScore  = catRanked[0]?.score ?? null;
  const universeSize = activeSchemes.length;
  const asOf         = allSchemes?.[0]?.date ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <AppShell title="Dashboard">
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">
              Fund data unavailable
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
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
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI universe…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {universeSize.toLocaleString()} active Growth schemes ·{" "}
              {overallCandidates.length.toLocaleString()} in overall pool ·{" "}
              {OVERALL_POOL_CATEGORIES.length} categories
            </p>
          </div>
          <DataSourceBadge source="AMFI + mfapi.in" asOf={asOf}
            note="NAV data updates once daily after market close." />
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={Layers}   label="Active schemes"  value={universeSize.toLocaleString()} />
          <KpiTile icon={Activity} label="Pool / scored"
            value={`${overallLoaded.toLocaleString()} / ${overallTotal.toLocaleString()}`}
            sub={`${OVERALL_POOL_CATEGORIES.length} cats`} />
          <KpiTile icon={Star}     label="Top adv. score"
            value={topAdvScore != null ? fmtNum(topAdvScore, 1) : "—"} tone="cyan" />
          <KpiTile icon={TrendingUp} label="Top cat. score"
            value={topCatScore != null ? fmtNum(topCatScore, 1) : "—"} tone="cyan" />
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABLE 1 — Overall Top 10                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Medal className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Overall Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                Advanced Score · All {OVERALL_POOL_CATEGORIES.length} Categories
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Every Direct-Growth scheme across all {OVERALL_POOL_CATEGORIES.length} AMFI fund categories —
              {" "}{overallCandidates.toLocaleString !== undefined
                ? overallCandidates.length.toLocaleString()
                : overallCandidates.length} funds in pool.
              Each fund is percentile-ranked on 6 risk-adjusted factors so debt, hybrid and
              equity funds compete on equal footing.
              <InfoTip text="Advanced Score = Sharpe (28%) + Sortino (22%) + Calmar = CAGR3Y/|MaxDD| (20%) + 3Y CAGR (15%) + Rolling 1Y Positive % (10%) + Max Drawdown (5%). Every factor is percentile-ranked within the entire loaded pool before weighting." />
            </p>
          </div>

          {/* Factor weight strip */}
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { label: "Sharpe",   pct: "28%", note: "Return / total vol" },
              { label: "Sortino",  pct: "22%", note: "Return / downside vol" },
              { label: "Calmar",   pct: "20%", note: "CAGR3Y / |MaxDD|" },
              { label: "3Y CAGR",  pct: "15%", note: "Compounded return" },
              { label: "Rolling+", pct: "10%", note: "% positive 1Y windows" },
              { label: "Max DD",   pct:  "5%", note: "Lower is better" },
            ].map((f) => (
              <div key={f.label}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px]">
                <span className="font-mono font-bold text-cyan">{f.pct}</span>
                <span className="text-muted-foreground">{f.label}</span>
                <span className="hidden text-muted-foreground/60 sm:block">· {f.note}</span>
              </div>
            ))}
          </div>

          <ProgressBar
            settled={overallSettled}
            loaded={overallLoaded}
            total={overallTotal}
            label={`Overall pool · ${OVERALL_POOL_CATEGORIES.length} categories`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {overallRanked.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Scoring full pool — {overallLoaded}/{overallTotal} loaded…
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 text-right font-medium">
                        Adv. Score
                        <InfoTip text="0–100, percentile-relative to all loaded schemes. Scores shift as the pool grows — final ranking is stable once all funds are loaded." />
                      </th>
                      <th className="p-3 text-right font-medium">Sharpe</th>
                      <th className="p-3 text-right font-medium">Sortino</th>
                      <th className="p-3 text-right font-medium">Calmar</th>
                      <th className="p-3 text-right font-medium">3Y CAGR</th>
                      <th className="p-3 text-right font-medium">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overallRanked.map((f, idx) => {
                      const isTop3 = idx < 3;
                      const m = f.metrics;
                      return (
                        <tr key={f.scheme.schemeCode}
                          className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}>

                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link to="/fund/$id" params={{ id: f.scheme.schemeCode }}
                              className="block max-w-[240px] text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                              {f.scheme.schemeName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.amc}
                            </p>
                          </td>

                          <td className="p-3">
                            <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                              {f.scheme.poolCategory}
                            </span>
                          </td>

                          <td className="p-3 text-right">
                            {f.advScore != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[13px] font-bold tabular-nums text-cyan">
                                  {fmtNum(f.advScore, 1)}
                                </span>
                                <ScoreBar value={f.advScore} />
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sharpe)}`}>
                            {fmtNum(m.sharpe, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.sortino)}`}>
                            {fmtNum(m.sortino, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(f.calmar)}`}>
                            {fmtNum(f.calmar, 2)}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(m.cagr3y)}`}>
                            {fmtPct(m.cagr3y, { signed: true })}
                          </td>
                          <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(m.maxDrawdown)}`}>
                            {fmtPct(m.maxDrawdown, { signed: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {overallLoaded.toLocaleString()} scored · {overallTotal.toLocaleString()} total · top {TOP_N} shown
              </span>
              {overallDone ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-positive">
                  <CheckCircle2 className="h-3 w-3" /> Complete · final ranking
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading — {overallSettled}/{overallTotal}…
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Advanced Score is <span className="text-foreground">percentile-relative</span> — a score of 85
            means this fund outranks ~85% of the entire pool on the weighted composite.
            Scores shift until all {overallTotal} funds are loaded; final order is stable after that.
          </p>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABLE 2 — Category Top 10                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}

        <section>
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <BarChart2 className="h-4 w-4 text-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight">Category Top 10</h2>
              <span className="rounded-lg border border-cyan/30 bg-cyan/[0.07] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan">
                QF Score · Direct Growth Only
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Direct-Growth plans only in the selected category, ranked by QuantFund Score. Regular, IDCW and other plan variants are excluded.
            </p>
          </div>

          {/* Category pills — all 34 categories */}
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
            {CAT_TABS.map((cat) => {
              const count = activeSchemes.filter(
                (s) => classifyAMFICategory(s.category) === cat,
              ).length;
              if (count === 0) return null;
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-150 ${
                    cat === activeCategory
                      ? "bg-cyan text-background shadow-[0_0_14px_rgba(34,211,238,0.3)]"
                      : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                  }`}>
                  {cat}
                  <span className="ml-1.5 opacity-50">({count})</span>
                </button>
              );
            })}
          </div>

          <ProgressBar
            settled={catSettled}
            loaded={catLoaded}
            total={catTotal}
            label={`${activeCategory} · ${catTotal} Direct-Growth plans`}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {/* Sub-header */}
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
                {activeCategory} · Top {TOP_N}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {catCandidates.length} plans in pool
              </span>
            </div>

            {catCandidates.length === 0 ? (
              <div className="py-16 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                No schemes found in {activeCategory}
              </div>
            ) : catRanked.filter((r) => r.score !== null).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                <p className="font-mono text-[11px] uppercase tracking-widest">
                  Loading {activeCategory} schemes…
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                      <th className="p-3 font-medium">Rk</th>
                      <th className="p-3 font-medium">Scheme</th>
                      <th className="p-3 text-right font-medium">
                        QF Score
                        <InfoTip text="CAGR3Y (35%) + Sharpe (25%) + Max Drawdown (20%) + Rolling 1Y Positive % (20%). Valid within a single category only." />
                      </th>
                      <th className="p-3 text-right font-medium">1Y Ret</th>
                      <th className="p-3 text-right font-medium">3Y CAGR</th>
                      <th className="p-3 text-right font-medium">Sharpe</th>
                      <th className="p-3 text-right font-medium">Max DD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {catRanked.map((s, idx) => {
                      const isTop3 = idx < 3;
                      return (
                        <tr key={s.schemeCode}
                          className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}>

                          <td className="p-3 font-mono text-[11px] font-bold tabular-nums">
                            <span className={isTop3 ? "text-cyan" : "text-muted-foreground"}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          <td className="p-3">
                            <div className="flex max-w-[300px] flex-col gap-0.5">
                              <Link to="/fund/$id" params={{ id: s.schemeCode }}
                                className="text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan">
                                {s.schemeName}
                              </Link>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                                  {s.amc} · ₹{s.nav.toFixed(2)}
                                </span>
                                <span className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider bg-positive/15 text-positive">
                                  Direct Growth
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-right">
                            {s.score != null ? (
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">
                                  {fmtNum(s.score, 1)}
                                </span>
                                <ScoreBar value={s.score} />
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {catLoaded}/{catTotal} scored{catDone && <span className="text-positive"> · final ranking</span>}
              </span>
              <Link to="/rankings"
                className="font-mono text-[9px] uppercase tracking-wider text-cyan transition-colors hover:text-cyan/80">
                Full rankings →
              </Link>
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">QuantFund Score</span> is within-category only — not valid across
            categories. Data:{" "}
            <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer"
              className="text-cyan underline underline-offset-2">AMFI India</a>{" "}
            &{" "}
            <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer"
              className="text-cyan underline underline-offset-2">mfapi.in</a>.
          </p>
        </section>

      </div>
    </AppShell>
  );
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "cyan";
}) {
  const valueClass =
    tone === "positive" ? "text-positive" :
    tone === "negative" ? "text-negative" :
    tone === "cyan"     ? "text-cyan"     : "text-foreground";
  const iconClass =
    tone === "positive" ? "text-positive" :
    tone === "negative" ? "text-negative" :
    tone === "cyan"     ? "text-cyan"     : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 opacity-70 ${iconClass}`} aria-hidden="true" />
      </div>
      <p className={`font-display text-xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
