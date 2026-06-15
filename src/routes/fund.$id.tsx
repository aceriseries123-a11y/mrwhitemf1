import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  ArrowLeft, Loader2, AlertCircle, TrendingUp, TrendingDown,
  ShieldCheck, BarChart2, Info, Trophy, Zap, CheckCircle2,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes } from "@/lib/live-data";
import { classifyAMFICategory } from "@/lib/categories";
import { useNavHistory, fetchNavHistory } from "@/lib/nav-history";
import type { NavHistory } from "@/lib/nav-history";
import { getSeries } from "@/lib/fund-store";
import type { NavPoint } from "@/lib/nav-history";
import { computeFundMetrics } from "@/lib/fund-metrics";
import { fmtPct, fmtNum, fmtAmfiDate } from "@/lib/format";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { Chart, axisStyle } from "@/components/Chart";
import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  computeEngineMetrics,
  buildBenchmark,
  scoreWithPeers,
  getRating,
  getStrengthsWeaknesses,
  checkEligibility,
  type EngineScoreResult,
  type EligibilityResult,
} from "@/lib/scoring-engine";

export const Route = createFileRoute("/fund/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Scheme ${params.id} — Fund Details · QuantFund` },
      { name: "description", content: `Real NAV history, trailing returns and risk-adjusted metrics for AMFI scheme ${params.id}.` },
      { property: "og:title", content: `Scheme ${params.id} — QuantFund` },
      { property: "og:description", content: `Quant analytics for AMFI scheme ${params.id} — every metric is computed from real NAV history.` },
      { property: "og:url", content: `https://mrwhitemf1.lovable.app/fund/${params.id}` },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: `https://mrwhitemf1.lovable.app/fund/${params.id}` }],
  }),
  component: FundPage,
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoBadge({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="pointer-events-none absolute left-4 top-0 z-20 hidden w-64 rounded-lg border border-border bg-surface p-2.5 text-[10px] normal-case tracking-normal text-foreground shadow-xl group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function StatCard({ label, value, tone, sub }: {
  label: string; value: string; tone?: "cyan" | "positive" | "negative"; sub?: string;
}) {
  const toneClass = tone === "cyan" ? "text-cyan" : tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 font-display text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MetricsCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-cyan" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">{title}</span>
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function PillarBar({ label, score, weight, available = true }: {
  label: string; score: number; weight: number; available?: boolean;
}) {
  const { color } = available ? getRating(score) : { color: "text-muted-foreground" };
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-[160px] shrink-0 items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground leading-tight">
          {label}
        </span>
      </div>
      <div className="flex flex-1 items-center gap-2">
        {available ? (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-cyan transition-all duration-700" style={{ width: `${score}%` }} />
            </div>
            <span className={`w-8 text-right font-mono text-[10px] font-bold tabular-nums ${color}`}>
              {Math.round(score)}
            </span>
          </>
        ) : (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border opacity-20" />
            <span className="w-24 text-right font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Data Not Available</span>
          </>
        )}
        <span className="w-9 text-right font-mono text-[8px] text-muted-foreground opacity-40">{weight}%</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function FundPage() {
  const { id } = Route.useParams();
  const { data: allSchemes, isLoading: schemesLoading } = useAMFISchemes();
  const { data: history, isLoading: histLoading, isError, error } = useNavHistory(id);
  const scheme = allSchemes?.find((s) => s.schemeCode === id);

  const legacyMetrics = useMemo(
    () => (history ? computeFundMetrics(history.series) : null),
    [history],
  );

  const chartOpt = useMemo(() => {
    if (!history) return null;
    const base = history.series[0].nav;
    const data: [number, number][] = history.series.map((p) => [p.t, +((p.nav / base) * 100).toFixed(2)]);
    return {
      grid: { left: 44, right: 12, top: 12, bottom: 32 },
      xAxis: { type: "time", ...axisStyle },
      yAxis: { type: "value", scale: true, ...axisStyle,
        axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => v.toFixed(0) } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(20,24,36,0.92)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#f5f7fa", fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        formatter: (params: any) => {
          const p = params[0];
          const d = new Date(p.value[0]).toISOString().slice(0, 10);
          const v = Number(p.value[1]).toFixed(2);
          const chg = p.value[1] - 100;
          const sign = chg >= 0 ? "+" : "";
          return `<div style="line-height:1.6">${d}<br/><b style="color:#7ad6ff">Indexed: ${v}</b><br/><span style="color:${chg >= 0 ? "#4ade80" : "#f87171"}">${sign}${chg.toFixed(2)}%</span></div>`;
        },
      },
      series: [{
        type: "line", showSymbol: false, smooth: 0.3, data,
        lineStyle: { width: 2, color: "#7ad6ff" },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: "rgba(122,214,255,0.22)" }, { offset: 1, color: "rgba(122,214,255,0)" }],
          },
        },
      }],
    } as any;
  }, [history]);

  const category = scheme
    ? classifyAMFICategory(scheme.category)
    : history?.schemeCategory ?? null;

  // ── Peer loading for category-based scoring ────────────────────────────────────
  // Find all direct-growth peers in the same category. Uses the same
  // queryKey=["nav-history", schemeCode] as the dashboard and rankings page,
  // so if the user visited either of those first all data is already cached.

  const peerCandidates = useMemo(() => {
    if (!allSchemes || !category) return [];
    return filterActiveSchemes(allSchemes).filter(
      (s) =>
        classifyAMFICategory(s.category) === category &&
        /direct/i.test(s.schemeName) &&
        /growth/i.test(s.schemeName),
    );
  }, [allSchemes, category]);

  const queryClient = useQueryClient();

  // Peer NAV queries — use React Query in-memory cache (populated by dashboard
  // or rankings) as initialData so peers that are already loaded start in
  // "success" state immediately with no network request.
  const peerNavQ = useQueries({
    queries: peerCandidates.map((s) => ({
      queryKey: ["nav-history", s.schemeCode],
      queryFn: () => fetchNavHistory(s.schemeCode),
      staleTime: 12 * 60 * 60 * 1000,
      retry: 1,
        // Read from React Query cache OR fund-store (populated by Dashboard) —
      // peers that Dashboard already loaded start as "success" instantly.
      initialData: () => {
        const cached = queryClient.getQueryData<NavHistory>(["nav-history", s.schemeCode]);
        if (cached) return cached;
        const series = getSeries(s.schemeCode);
        if (series) return {
          schemeCode: s.schemeCode,
          schemeName: s.schemeName,
          fundHouse: s.amc,
          schemeType: s.schemeType,
          schemeCategory: s.category,
          series,
        } satisfies NavHistory;
        return undefined;
      },
      initialDataUpdatedAt: () =>
        queryClient.getQueryState(["nav-history", s.schemeCode])?.dataUpdatedAt,
    })),
  });

  const peersLoaded = peerNavQ.filter((q) => q.isSuccess).length;
  const peersTotal  = peerCandidates.length;
  const peersDone   = peersLoaded === peersTotal && peersTotal > 0;

  // Score the fund against its category peers using the new category-based engine
  const engineResult = useMemo((): {
    scoreResult: EngineScoreResult;
    peersCount: number;
    categoryRank: number | null;
  } | null => {
    if (!history?.series?.length) return null;

    const allSeries: NavPoint[][] = [];
    let thisFundIdx = -1;

    peerCandidates.forEach((s, i) => {
      const ser = peerNavQ[i]?.data?.series;
      if (ser?.length) {
        if (s.schemeCode === id) thisFundIdx = allSeries.length;
        allSeries.push(ser);
      }
    });

    // If this fund isn't in peerCandidates (e.g. it's a Regular plan), include directly
    if (thisFundIdx < 0) {
      thisFundIdx = allSeries.length;
      allSeries.push(history.series);
    }

    if (allSeries.length < 2) return null;

    const benchmark  = buildBenchmark(allSeries);
    const allMetrics = allSeries.map((s) => computeEngineMetrics(s, benchmark));
    const scoreResult = scoreWithPeers(allMetrics[thisFundIdx], allMetrics);

    // Category rank — score every peer and rank by fundScore (descending)
    let categoryRank: number | null = null;
    if (allSeries.length >= 3) {
      const fundScores = allMetrics.map((m) => scoreWithPeers(m, allMetrics).fundScore);
      const sorted = [...fundScores].sort((a, b) => b - a);
      categoryRank = sorted.indexOf(fundScores[thisFundIdx]) + 1;
    }

    return { scoreResult, peersCount: allSeries.length, categoryRank };
  }, [history, peerCandidates, peerNavQ, id]);

  const sr = engineResult?.scoreResult ?? null;
  const ratingInfo = sr ? getRating(sr.fundScore) : null;
  const sw = sr ? getStrengthsWeaknesses(sr.pillars) : null;
  const em = sr
    ? (() => {
        if (!history?.series?.length) return null;
        const allSeries: NavPoint[][] = [];
        let thisFundIdx = -1;
        peerCandidates.forEach((s, i) => {
          const ser = peerNavQ[i]?.data?.series;
          if (ser?.length) {
            if (s.schemeCode === id) thisFundIdx = allSeries.length;
            allSeries.push(ser);
          }
        });
        if (thisFundIdx < 0) { thisFundIdx = allSeries.length; allSeries.push(history.series); }
        const benchmark = buildBenchmark(allSeries);
        return computeEngineMetrics(allSeries[thisFundIdx], benchmark);
      })()
    : null;

  const fundName = history?.schemeName ?? scheme?.schemeName ?? "";
  const isDirectPlan = /direct/i.test(fundName);
  const eligibility: EligibilityResult | null = em
    ? checkEligibility({
        historyYears: em.historyYears,
        isDirectPlan,
        rolling3yWindowCount: em.rollingReturn3yAvg != null ? 8 : 0,
      })
    : null;

  return (
    <AppShell title={scheme?.schemeName ?? history?.schemeName ?? `Scheme ${id}`}>
      <div className="mx-auto max-w-4xl space-y-4">

        {/* Back navigation */}
        <Link to="/explorer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Fund Explorer
        </Link>

        {/* Loading */}
        {(schemesLoading || histLoading) && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-cyan" />
            <p className="font-mono text-[11px] uppercase tracking-widest">Loading NAV history…</p>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
            <div>
              <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">NAV history unavailable</p>
              <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
            </div>
          </div>
        )}

        {history && legacyMetrics && (
          <>
            {/* ── Fund header card ────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{history.fundHouse}</p>
                  <h1 className="mt-1 font-display text-xl font-bold leading-snug md:text-2xl">{history.schemeName}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {category ?? "—"}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      #{history.schemeCode}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {history.schemeType}
                    </span>
                    {ratingInfo && sr && (
                      <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${ratingInfo.bg} ${ratingInfo.color}`}>
                        {sr.rating}
                      </span>
                    )}
                  </div>
                </div>
                <DataSourceBadge
                  source="mfapi.in / AMFI"
                  asOf={fmtAmfiDate(scheme?.date)}
                  note={`${history.series.length.toLocaleString()} daily NAVs · ${legacyMetrics.history_years.toFixed(1)}y history`}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <StatCard label="Latest NAV" value={`₹${fmtNum(legacyMetrics.navEnd?.nav ?? null)}`} />
                {sr ? (
                  <StatCard label="Fund Score" value={String(sr.fundScore)} tone="cyan"
                    sub={`${sr.rating} · Confidence ${sr.confidenceScore}/100`} />
                ) : (
                  <StatCard label="Fund Score" value="…" tone="cyan" sub="Loading peers…" />
                )}
                {sr && engineResult?.categoryRank ? (
                  <StatCard label="Category Rank" value={`#${engineResult.categoryRank}`} tone="cyan"
                    sub={`of ${engineResult.peersCount} in ${category ?? "category"}`} />
                ) : (
                  <StatCard label="Category Rank" value="…" sub="Loading peers…" />
                )}
                <StatCard label="3Y CAGR" value={fmtPct(legacyMetrics.cagr3y, { signed: true })}
                  tone={legacyMetrics.cagr3y != null ? (legacyMetrics.cagr3y >= 0 ? "positive" : "negative") : undefined} />
              </div>
            </div>

            {/* ── Category Score Card ─────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Trophy className="h-4 w-4 text-cyan" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
                  QuantFund Score
                </span>
                {peersDone ? (
                  <span className="flex items-center gap-1 rounded border border-positive/30 bg-positive/[0.07] px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest text-positive">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {engineResult?.peersCount ?? 0} peers · final
                  </span>
                ) : peersTotal > 0 ? (
                  <span className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Loading {peersLoaded}/{peersTotal} category peers…
                  </span>
                ) : null}
                <InfoBadge text="Every metric is converted to a percentile rank within the same category before weighting. A category score of 80 means this fund outranks ~80% of its category peers on that category. Portfolio Quality and Manager Quality are marked Data Not Available — holdings and manager-tenure data are not available from AMFI/mfapi.in, so their weight is not faked." />
              </div>

              {!sr ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan" />
                  <p className="font-mono text-[10px] uppercase tracking-widest">
                    Scoring against {peersTotal} category peers — {peersLoaded} loaded…
                  </p>
                </div>
              ) : eligibility && !eligibility.eligible ? (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-warning">Not Ranked — Eligibility Not Met</p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                    {eligibility.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  <p className="text-[10px] text-muted-foreground">
                    Eligible funds require ≥5 years of NAV history, a Direct plan, and sufficient history for 3Y rolling-return calculations.
                  </p>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Left: big score + rating + strengths */}
                  <div>
                    <div className="mb-4 flex items-end gap-3">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-5xl font-black tabular-nums leading-none text-cyan">
                            {sr.fundScore}
                          </span>
                          <span className="font-mono text-sm text-muted-foreground">/100</span>
                        </div>
                        <span className={`mt-1 inline-block rounded border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${ratingInfo!.bg} ${ratingInfo!.color}`}>
                          {sr.rating}
                        </span>
                        <p className="mt-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Fund Score</p>
                      </div>
                      <div className="mb-1">
                        <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Confidence Score</p>
                        <p className="font-display text-xl font-bold tabular-nums text-foreground">{sr.confidenceScore}<span className="font-mono text-xs text-muted-foreground">/100</span></p>
                        <p className="font-mono text-[8px] text-muted-foreground">{engineResult?.peersCount} peers · {category}</p>
                      </div>
                    </div>

                    {/* Strengths / weaknesses */}
                    {(sw!.strengths.length > 0 || sw!.weaknesses.length > 0) && (
                      <div className="mb-4 space-y-1.5">
                        {sw!.strengths.map((s) => (
                          <div key={s} className="flex items-center gap-1.5 rounded-lg border border-positive/20 bg-positive/[0.06] px-2.5 py-1.5">
                            <Zap className="h-3 w-3 shrink-0 text-positive" />
                            <span className="font-mono text-[9px] uppercase tracking-widest text-positive">Strength: {s}</span>
                          </div>
                        ))}
                        {sw!.weaknesses.map((w) => (
                          <div key={w} className="flex items-center gap-1.5 rounded-lg border border-warning/20 bg-warning/[0.06] px-2.5 py-1.5">
                            <ShieldCheck className="h-3 w-3 shrink-0 text-warning" />
                            <span className="font-mono text-[9px] uppercase tracking-widest text-warning">Watch: {w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fund Score bar */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Fund Score</span>
                        <span className="font-mono text-[10px] font-bold text-cyan">{sr.fundScore}/100</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan/70 to-cyan transition-all duration-700"
                          style={{ width: `${sr.fundScore}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Right: category breakdown */}
                  <div className="space-y-1.5">
                    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Category Breakdown</p>
                    <PillarBar label="Risk"              score={sr.pillars.risk.rawScore}             weight={30} available={sr.pillars.risk.available} />
                    <PillarBar label="Performance"       score={sr.pillars.performance.rawScore}      weight={25} available={sr.pillars.performance.available} />
                    <PillarBar label="Consistency"       score={sr.pillars.consistency.rawScore}      weight={20} available={sr.pillars.consistency.available} />
                    <PillarBar label="Benchmark Skill"   score={sr.pillars.benchmarkSkill.rawScore}   weight={10} available={sr.pillars.benchmarkSkill.available} />
                    <PillarBar label="Portfolio Quality" score={sr.pillars.portfolioQuality.rawScore} weight={10} available={sr.pillars.portfolioQuality.available} />
                    <PillarBar label="Manager Quality"   score={sr.pillars.managerQuality.rawScore}   weight={5}  available={sr.pillars.managerQuality.available} />
                  </div>
                </div>
              )}

              {/* Engine metrics grid (only when scored) */}
              {sr && em && (
                <div className="mt-5 border-t border-border/60 pt-4">
                  <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Engine Metrics</p>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-2.5 sm:grid-cols-6">
                    {[
                      { label: "3Y CAGR",    v: em.cagr3y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                      { label: "5Y CAGR",    v: em.cagr5y,          fmt: (x: number) => fmtPct(x, { signed: true }) },
                      { label: "Sortino",    v: em.sortino,          fmt: (x: number) => fmtNum(x, 2) },
                      { label: "Sharpe",     v: em.sharpe,           fmt: (x: number) => fmtNum(x, 2) },
                      { label: "Info Ratio", v: em.informationRatio, fmt: (x: number) => fmtNum(x, 2) },
                      { label: "Alpha",      v: em.longRunAlpha,     fmt: (x: number) => fmtPct(x, { signed: true }) },
                      { label: "Calmar",     v: em.calmarRatio,      fmt: (x: number) => fmtNum(x, 2) },
                      { label: "Beta",       v: em.beta,             fmt: (x: number) => fmtNum(x, 2) },
                      { label: "↓ Capture",  v: em.downsideCapture,  fmt: (x: number) => `${fmtNum(x, 1)}%` },
                      { label: "↑ Capture",  v: em.upsideCapture,    fmt: (x: number) => `${fmtNum(x, 1)}%` },
                      { label: "Max DD",     v: em.maxDrawdown,      fmt: (x: number) => fmtPct(x, { signed: true }) },
                      { label: "Recovery",   v: em.recoveryMonths,   fmt: (x: number) => `${fmtNum(x, 1)} mo` },
                    ].map(({ label, v, fmt }) => (
                      <div key={label}>
                        <p className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground">{label}</p>
                        <p className="font-mono text-[11px] font-bold tabular-nums text-foreground">
                          {v == null ? "—" : fmt(v as number)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── NAV chart ───────────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  NAV — Indexed to 100 from inception
                </span>
                <span className="font-mono text-[10px] text-cyan">{legacyMetrics.history_years.toFixed(1)}Y available</span>
              </div>
              {chartOpt && <Chart height={280} option={chartOpt} />}
            </div>

            {/* ── Metrics tables ──────────────────────────────────────────── */}
            <div className="grid gap-4 md:grid-cols-2">
              <MetricsCard title="Trailing Returns" icon={TrendingUp}>
                {[
                  ["1 Month",  legacyMetrics.ret1m],
                  ["3 Months", legacyMetrics.ret3m],
                  ["6 Months", legacyMetrics.ret6m],
                  ["1 Year",   legacyMetrics.ret1y],
                  ["3Y CAGR",  legacyMetrics.cagr3y],
                  ["5Y CAGR",  legacyMetrics.cagr5y],
                  ["10Y CAGR", legacyMetrics.cagr10y],
                ].map(([label, val]) => (
                  <MetricRow key={label as string} label={label as string}
                    value={fmtPct(val as number | null, { signed: true })}
                    tone={val != null ? ((val as number) >= 0 ? "positive" : "negative") : undefined} />
                ))}
              </MetricsCard>

              <MetricsCard title="Risk Profile" icon={ShieldCheck}>
                <MetricRow label="Annualised volatility" value={fmtPct(legacyMetrics.vol)} />
                <MetricRow label="Downside volatility" value={fmtPct(legacyMetrics.downsideVol)} />
                <MetricRow label="Sharpe ratio" value={fmtNum(legacyMetrics.sharpe, 2)}
                  tone={legacyMetrics.sharpe != null ? (legacyMetrics.sharpe >= 1 ? "positive" : legacyMetrics.sharpe < 0 ? "negative" : undefined) : undefined} />
                <MetricRow label="Sortino ratio" value={fmtNum(legacyMetrics.sortino, 2)}
                  tone={legacyMetrics.sortino != null ? (legacyMetrics.sortino >= 1 ? "positive" : legacyMetrics.sortino < 0 ? "negative" : undefined) : undefined} />
                <MetricRow label="Max drawdown" value={fmtPct(legacyMetrics.maxDrawdown, { signed: true })}
                  tone={legacyMetrics.maxDrawdown != null ? (legacyMetrics.maxDrawdown >= -0.15 ? "positive" : "negative") : undefined} />
                <MetricRow label="1Y rolling positive %" value={fmtPct(legacyMetrics.rollingPositive1y)}
                  tone={legacyMetrics.rollingPositive1y != null ? (legacyMetrics.rollingPositive1y >= 0.7 ? "positive" : undefined) : undefined} />
                <MetricRow label="History available" value={`${legacyMetrics.history_years.toFixed(1)}y`} />
              </MetricsCard>
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              All metrics are derived from {history.series.length.toLocaleString()} daily NAV observations
              sourced from{" "}
              <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>
              {" "}(community mirror of AMFI). Risk-free rate assumed at 6.50% (91-day G-Sec T-Bill proxy).
              Fund Score uses category-relative percentile ranking across {engineResult?.peersCount ?? peersTotal} direct-growth peers in {category ?? "this category"}, never compared across categories.
              Portfolio Quality and Manager Quality are marked Data Not Available — portfolio holdings, sector exposure, turnover, and manager-tenure data are not available from AMFI/mfapi.in, so their combined 15% weight is redistributed across the four available categories rather than estimated. See the{" "}
              <Link to="/methodology" className="text-cyan underline underline-offset-2">Methodology</Link> page for the full breakdown.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
