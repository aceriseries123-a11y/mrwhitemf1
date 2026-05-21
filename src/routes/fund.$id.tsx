import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Chart, axisStyle } from "@/components/Chart";
import { MetricCard } from "@/components/MetricCard";
import { useMemo } from "react";
import { ArrowLeft, TrendingUp, ShieldCheck, Activity, Sparkles } from "lucide-react";
import { useAMFISchemes, useNavHistory, useMetrics, fmt } from "@/lib/live-data";

export const Route = createFileRoute("/fund/$id")({
  head: ({ params }) => ({ meta: [{ title: `Scheme ${params.id} — Fund Details · QuantFund` }] }),
  component: FundPage,
});

function FundPage() {
  const { id } = Route.useParams();
  const { schemes } = useAMFISchemes();
  const { history, loading: histLoading, error: histErr } = useNavHistory(id);
  const { metrics } = useMetrics(id);
  const { history: bench } = useNavHistory("118825");

  const scheme = schemes?.find(s => s.schemeCode === id);
  const name = history?.meta.scheme_name || scheme?.schemeName || `Scheme ${id}`;
  const category = history?.meta.scheme_category || scheme?.bucket || "—";
  const amc = history?.meta.fund_house || scheme?.amc || "—";

  // Sample for chart
  const chart = useMemo(() => {
    if (!history) return null;
    const s = history.series;
    if (s.length < 2) return null;
    const step = Math.max(1, Math.floor(s.length / 250));
    const f = s.filter((_, i) => i % step === 0);
    const fStart = f[0].nav;
    let bSeries: { date: Date; nav: number }[] = [];
    if (bench && bench.series.length) {
      const bs = bench.series.filter(p => p.date >= f[0].date);
      const bStep = Math.max(1, Math.floor(bs.length / 250));
      bSeries = bs.filter((_, i) => i % bStep === 0);
    }
    const bStart = bSeries[0]?.nav ?? 1;
    return {
      dates: f.map(p => p.date.toISOString().slice(0, 10)),
      fund: f.map(p => +(p.nav / fStart * 100).toFixed(2)),
      bench: bSeries.slice(0, f.length).map(p => +(p.nav / bStart * 100).toFixed(2)),
    };
  }, [history, bench]);

  const dd = useMemo(() => {
    if (!history) return [];
    let peak = history.series[0]?.nav ?? 0;
    return history.series.filter((_, i) => i % Math.max(1, Math.floor(history.series.length / 250)) === 0).map(p => {
      peak = Math.max(peak, p.nav);
      return { date: p.date.toISOString().slice(0, 10), v: +((p.nav / peak - 1) * 100).toFixed(2) };
    });
  }, [history]);

  return (
    <AppShell title="Fund Details">
      <Link to="/explorer" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to explorer
      </Link>

      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{category} · AMFI {id}</div>
            <h1 className="mt-1 font-display text-2xl font-bold">{name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              AMC: {amc} · Latest NAV: ₹{history?.series[history.series.length - 1]?.nav.toFixed(4) ?? "—"}
              {history?.series.length ? ` · as of ${history.series[history.series.length - 1].date.toISOString().slice(0, 10)}` : ""}
              {" · "}AUM: {scheme?.aum ? `₹ ${scheme.aum.toLocaleString()} Cr` : "N/A"} <span title="AUM data requires AMFI subscription">ⓘ</span>
            </div>
          </div>
          <div className="rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-wider text-cyan">AI Score</div>
            <div className="font-mono text-3xl font-bold text-cyan">{fmt.score(metrics?.aiScore)}</div>
            <div className="text-[10px] text-muted-foreground">/ 100</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard label="1Y CAGR" value={fmt.pct(metrics?.r1Y, 2)} icon={TrendingUp} />
        <MetricCard label="3Y CAGR" value={fmt.pct(metrics?.r3Y, 2)} icon={TrendingUp} />
        <MetricCard label="5Y CAGR" value={fmt.pct(metrics?.r5Y, 2)} icon={TrendingUp} />
        <MetricCard label="Sharpe" value={fmt.num(metrics?.sharpe, 2)} icon={ShieldCheck} hint={`Sortino ${fmt.num(metrics?.sortino, 2)}`} />
        <MetricCard label="Alpha / Beta" value={`${fmt.num(metrics?.alpha, 2)} / ${fmt.num(metrics?.beta, 2)}`} icon={Activity} />
        <MetricCard label="Max Drawdown" value={fmt.pct(metrics?.maxDrawdown, 1)} icon={ShieldCheck} hint={`StdDev ${fmt.num(metrics?.stdDev, 2)}%`} />
      </div>

      {histLoading && <div className="glass mt-4 rounded-2xl p-6 text-center text-sm text-muted-foreground">Loading real NAV history from MFAPI.in…</div>}
      {histErr && <div className="glass mt-4 rounded-2xl p-4 text-sm text-negative">Could not load NAV history: {histErr}</div>}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-4 lg:col-span-2">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">NAV vs NIFTY 50 · Indexed to 100</div>
          {chart ? (
            <Chart height={320} option={{
              xAxis: { type: "category", data: chart.dates, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, interval: Math.floor(chart.dates.length / 8) } },
              yAxis: { type: "value", scale: true, ...axisStyle },
              legend: { data: ["Fund", "NIFTY 50"], textStyle: { color: "rgba(245,247,250,0.7)" }, top: 0, right: 0 },
              series: [
                { name: "Fund", type: "line", showSymbol: false, smooth: true, data: chart.fund,
                  lineStyle: { width: 2, color: "#7ad6ff" },
                  areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(122,214,255,0.35)" }, { offset: 1, color: "rgba(122,214,255,0)" }] } } },
                { name: "NIFTY 50", type: "line", showSymbol: false, smooth: true, data: chart.bench,
                  lineStyle: { width: 1.5, color: "rgba(255,255,255,0.45)", type: "dashed" } },
              ],
            }} />
          ) : <div className="grid h-[320px] place-items-center text-xs text-muted-foreground">Loading…</div>}
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Risk Profile</div>
          {metrics ? (
            <Chart height={320} option={{
              radar: {
                indicator: [
                  { name: "Sharpe ×30", max: 90 },
                  { name: "Sortino ×25", max: 90 },
                  { name: "Alpha+30", max: 60 },
                  { name: "DD Stab", max: 100 },
                  { name: "Consistency", max: 100 },
                  { name: "AI Score", max: 100 },
                ],
                axisName: { color: "rgba(245,247,250,0.7)", fontSize: 11 },
                splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
              },
              series: [{
                type: "radar",
                data: [{
                  value: [
                    Math.max(0, (metrics.sharpe ?? 0) * 30),
                    Math.max(0, (metrics.sortino ?? 0) * 25),
                    Math.max(0, (metrics.alpha ?? 0) + 30),
                    Math.max(0, 100 - Math.abs(metrics.maxDrawdown ?? 25) * 1.5),
                    (metrics.rollingWinRate ?? 0) * 100,
                    metrics.aiScore ?? 0,
                  ],
                  name: amc,
                  areaStyle: { color: "rgba(122,214,255,0.25)" },
                  lineStyle: { color: "#7ad6ff" }, itemStyle: { color: "#7ad6ff" },
                }],
              }],
            }} />
          ) : <Sparkles className="mx-auto mt-12 h-6 w-6 animate-pulse text-muted-foreground" />}
        </div>
      </div>

      <div className="mt-4 glass rounded-2xl p-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Drawdown curve</div>
        {dd.length ? (
          <Chart height={280} option={{
            xAxis: { type: "category", data: dd.map(d => d.date), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, interval: Math.floor(dd.length / 8) } },
            yAxis: { type: "value", ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}%" } },
            series: [{ type: "line", showSymbol: false, smooth: true, data: dd.map(d => d.v),
              lineStyle: { width: 1, color: "#e74c3c" },
              areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(231,76,60,0)" }, { offset: 1, color: "rgba(231,76,60,0.35)" }] } } }],
          }} />
        ) : <div className="grid h-[280px] place-items-center text-xs text-muted-foreground">Loading…</div>}
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        Source: AMFI India & MFAPI.in · NAV as of {history?.series[history.series.length - 1]?.date.toISOString().slice(0, 10) ?? "—"}
      </div>
    </AppShell>
  );
}
