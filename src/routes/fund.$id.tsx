import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ArrowLeft, Loader2, AlertCircle, TrendingUp, TrendingDown, ShieldCheck, BarChart2, Info } from "lucide-react";
import { useAMFISchemes } from "@/lib/live-data";
import { classifyAMFICategory } from "@/lib/categories";
import { useNavHistory } from "@/lib/nav-history";
import { computeFundMetrics, quantFundScore } from "@/lib/fund-metrics";
import { fmtPct, fmtNum, fmtAmfiDate } from "@/lib/format";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { Chart, axisStyle } from "@/components/Chart";
import { useMemo } from "react";

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

function FundPage() {
  const { id } = Route.useParams();
  const { data: schemes, isLoading: schemesLoading } = useAMFISchemes();
  const { data: history, isLoading: histLoading, isError, error } = useNavHistory(id);
  const scheme = schemes?.find((s) => s.schemeCode === id);

  const metrics = useMemo(() => (history ? computeFundMetrics(history.series) : null), [history]);
  const score = metrics ? quantFundScore(metrics) : null;

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

  const category = scheme ? classifyAMFICategory(scheme.category) : history?.schemeCategory ?? "—";

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

        {history && metrics && (
          <>
            {/* Fund header card */}
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{history.fundHouse}</p>
                  <h1 className="mt-1 font-display text-xl font-bold leading-snug md:text-2xl">{history.schemeName}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {category}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      #{history.schemeCode}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {history.schemeType}
                    </span>
                  </div>
                </div>
                <DataSourceBadge
                  source="mfapi.in / AMFI"
                  asOf={fmtAmfiDate(scheme?.date)}
                  note={`${history.series.length.toLocaleString()} daily NAVs · ${metrics.history_years.toFixed(1)}y history`}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <StatCard label="Latest NAV" value={`₹${fmtNum(metrics.navEnd?.nav ?? null)}`} />
                <StatCard label="QF Score" value={score != null ? fmtNum(score, 1) : "—"} tone="cyan"
                  sub={score != null ? "out of 100" : "insufficient history"} />
                <StatCard label="1Y Return" value={fmtPct(metrics.ret1y, { signed: true })}
                  tone={metrics.ret1y != null ? (metrics.ret1y >= 0 ? "positive" : "negative") : undefined} />
                <StatCard label="3Y CAGR" value={fmtPct(metrics.cagr3y, { signed: true })}
                  tone={metrics.cagr3y != null ? (metrics.cagr3y >= 0 ? "positive" : "negative") : undefined} />
              </div>
            </div>

            {/* Score breakdown */}
            {score != null && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-cyan" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">QuantFund Score Breakdown</span>
                  <InfoBadge text="Score = CAGR3Y(35%) + Sharpe(25%) + MaxDD(20%) + Rolling1Y(20%). Each factor is normalised 0–100 before weighting." />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <ScoreFactor label="3Y CAGR" weight="35%" value={fmtPct(metrics.cagr3y, { signed: true })}
                    tone={metrics.cagr3y != null ? (metrics.cagr3y >= 0 ? "positive" : "negative") : undefined} icon={TrendingUp} />
                  <ScoreFactor label="Sharpe Ratio" weight="25%" value={fmtNum(metrics.sharpe, 2)}
                    tone={metrics.sharpe != null ? (metrics.sharpe >= 1 ? "positive" : metrics.sharpe >= 0 ? undefined : "negative") : undefined} icon={ShieldCheck} />
                  <ScoreFactor label="Max Drawdown" weight="20%" value={fmtPct(metrics.maxDrawdown, { signed: true })}
                    tone={metrics.maxDrawdown != null ? (metrics.maxDrawdown >= -0.15 ? "positive" : "negative") : undefined} icon={TrendingDown} note="Lower is better" />
                  <ScoreFactor label="1Y Rolling +" weight="20%" value={fmtPct(metrics.rollingPositive1y)}
                    tone={metrics.rollingPositive1y != null ? (metrics.rollingPositive1y >= 0.7 ? "positive" : undefined) : undefined} icon={BarChart2} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Composite Score</span>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan transition-all duration-700"
                        style={{ width: `${Math.min(100, score)}%` }} />
                    </div>
                    <span className="font-mono font-bold text-cyan">{fmtNum(score, 1)} / 100</span>
                  </div>
                </div>
              </div>
            )}

            {/* NAV chart */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  NAV — Indexed to 100 from inception
                </span>
                <span className="font-mono text-[10px] text-cyan">{metrics.history_years.toFixed(1)}Y available</span>
              </div>
              {chartOpt && <Chart height={280} option={chartOpt} />}
            </div>

            {/* Metrics tables */}
            <div className="grid gap-4 md:grid-cols-2">
              <MetricsCard title="Trailing Returns" icon={TrendingUp}>
                {[
                  ["1 Month", metrics.ret1m],
                  ["3 Months", metrics.ret3m],
                  ["6 Months", metrics.ret6m],
                  ["1 Year", metrics.ret1y],
                  ["3Y CAGR", metrics.cagr3y],
                  ["5Y CAGR", metrics.cagr5y],
                  ["10Y CAGR", metrics.cagr10y],
                ].map(([label, val]) => (
                  <MetricRow key={label as string} label={label as string}
                    value={fmtPct(val as number | null, { signed: true })}
                    tone={val != null ? (val >= 0 ? "positive" : "negative") : undefined} />
                ))}
              </MetricsCard>

              <MetricsCard title="Risk Profile" icon={ShieldCheck}>
                <MetricRow label="Annualised volatility" value={fmtPct(metrics.vol)} />
                <MetricRow label="Downside volatility" value={fmtPct(metrics.downsideVol)} />
                <MetricRow label="Sharpe ratio" value={fmtNum(metrics.sharpe, 2)}
                  tone={metrics.sharpe != null ? (metrics.sharpe >= 1 ? "positive" : metrics.sharpe < 0 ? "negative" : undefined) : undefined} />
                <MetricRow label="Sortino ratio" value={fmtNum(metrics.sortino, 2)}
                  tone={metrics.sortino != null ? (metrics.sortino >= 1 ? "positive" : metrics.sortino < 0 ? "negative" : undefined) : undefined} />
                <MetricRow label="Max drawdown" value={fmtPct(metrics.maxDrawdown, { signed: true })}
                  tone={metrics.maxDrawdown != null ? (metrics.maxDrawdown >= -0.15 ? "positive" : "negative") : undefined} />
                <MetricRow label="1Y rolling positive %" value={fmtPct(metrics.rollingPositive1y)}
                  tone={metrics.rollingPositive1y != null ? (metrics.rollingPositive1y >= 0.7 ? "positive" : undefined) : undefined} />
                <MetricRow label="History available" value={`${metrics.history_years.toFixed(1)}y`} />
              </MetricsCard>
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              All metrics are derived from {history.series.length.toLocaleString()} daily NAV observations
              sourced from{" "}
              <a href="https://www.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2">mfapi.in</a>
              {" "}(community mirror of AMFI). Risk-free rate assumed at 6.50% (91-day G-Sec T-Bill proxy).
              AUM, expense ratio, fund-manager tenure and portfolio holdings are not available in the AMFI feed
              and are intentionally absent rather than estimated.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  label, value, tone, sub,
}: {
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

function ScoreFactor({
  label, weight, value, tone, icon: Icon, note,
}: {
  label: string; weight: string; value: string;
  tone?: "positive" | "negative"; icon: React.ElementType; note?: string;
}) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground opacity-60">{weight}</span>
      </div>
      <p className={`font-mono text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
      {note && <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{note}</p>}
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
