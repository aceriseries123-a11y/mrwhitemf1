import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
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
    // Indexed to 100 from the first available date for readability
    const base = history.series[0].nav;
    const data: [number, number][] = history.series.map((p) => [p.t, +((p.nav / base) * 100).toFixed(2)]);
    return {
      grid: { left: 40, right: 12, top: 16, bottom: 30 },
      xAxis: { type: "time", ...axisStyle },
      yAxis: { type: "value", scale: true, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}" } },
      tooltip: { trigger: "axis", formatter: (p: any) => `${new Date(p[0].value[0]).toISOString().slice(0,10)}<br/>Indexed NAV: ${p[0].value[1]}` },
      series: [{
        type: "line", showSymbol: false, smooth: true, data,
        lineStyle: { width: 1.5, color: "#22d3ee" },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(34,211,238,0.25)" }, { offset: 1, color: "rgba(34,211,238,0)" }] } },
      }],
    } as any;
  }, [history]);

  return (
    <AppShell title={scheme?.schemeName ?? history?.schemeName ?? `Scheme ${id}`}>
      <Link to="/explorer" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Explorer
      </Link>

      {(schemesLoading || histLoading) && (
        <div className="glass flex items-center gap-3 rounded-2xl p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading NAV history…
        </div>
      )}

      {isError && (
        <div className="glass flex items-start gap-3 rounded-2xl border border-negative/30 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 text-negative" />
          <div>
            <div className="text-sm font-medium">NAV history unavailable</div>
            <div className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</div>
          </div>
        </div>
      )}

      {history && metrics && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{history.fundHouse}</div>
                <h1 className="mt-1 text-xl font-semibold md:text-2xl">{history.schemeName}</h1>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {history.schemeCategory} · {history.schemeType}
                </div>
              </div>
              <DataSourceBadge source="mfapi.in / AMFI" asOf={fmtAmfiDate(scheme?.date)} note={`${history.series.length.toLocaleString()} daily NAVs over ${metrics.history_years.toFixed(1)}y`} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Latest NAV" value={`₹${fmtNum(metrics.navEnd?.nav ?? null)}`} />
              <Stat label="QF Score" value={score != null ? fmtNum(score, 1) : "—"} tone="cyan" />
              <Stat label="Category" value={scheme ? classifyAMFICategory(scheme.category) : history.schemeCategory} />
              <Stat label="Scheme code" value={history.schemeCode} mono />
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-mono uppercase tracking-wider text-muted-foreground">NAV · Indexed to 100</span>
              <span className="font-mono text-cyan">{metrics.history_years.toFixed(1)}Y</span>
            </div>
            {chartOpt && <Chart height={300} option={chartOpt} />}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <MetricsTable
              title="Trailing returns"
              rows={[
                ["1M", fmtPct(metrics.ret1m, { signed: true })],
                ["3M", fmtPct(metrics.ret3m, { signed: true })],
                ["6M", fmtPct(metrics.ret6m, { signed: true })],
                ["1Y", fmtPct(metrics.ret1y, { signed: true })],
                ["3Y CAGR", fmtPct(metrics.cagr3y, { signed: true })],
                ["5Y CAGR", fmtPct(metrics.cagr5y, { signed: true })],
                ["10Y CAGR", fmtPct(metrics.cagr10y, { signed: true })],
              ]}
            />
            <MetricsTable
              title="Risk profile"
              rows={[
                ["Annualised volatility", fmtPct(metrics.vol)],
                ["Downside volatility", fmtPct(metrics.downsideVol)],
                ["Sharpe ratio", fmtNum(metrics.sharpe, 2)],
                ["Sortino ratio", fmtNum(metrics.sortino, 2)],
                ["Max drawdown", fmtPct(metrics.maxDrawdown, { signed: true })],
                ["1Y rolling positive %", fmtPct(metrics.rollingPositive1y)],
                ["History available", `${metrics.history_years.toFixed(1)}y`],
              ]}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            All metrics above are derived from {history.series.length.toLocaleString()} daily NAV observations. Risk-free rate
            assumed at 6.50% (91-day G-Sec T-Bill). AUM, expense ratio, fund-manager tenure and holdings are not available in
            the AMFI feed and are intentionally not shown rather than estimated.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone, mono }: { label: string; value: string; tone?: "cyan"; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 ${mono ? "font-mono text-sm" : "text-base font-semibold"} ${tone === "cyan" ? "text-cyan" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function MetricsTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-cyan">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 text-muted-foreground">{k}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
