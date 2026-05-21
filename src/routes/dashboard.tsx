import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Chart, axisStyle } from "@/components/Chart";
import { useMemo } from "react";
import {
  Activity, TrendingUp, ShieldCheck, Trophy, Sparkles, Layers,
  ArrowRight, AlertTriangle,
} from "lucide-react";
import {
  useAMFISchemes, useTicks, useCuratedMetrics, useNavHistory,
  CURATED_CODES, fmt, type Metrics,
} from "@/lib/live-data";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — QuantFund Terminal" }] }),
  component: Dashboard,
});

type Row = { code: string; name: string; bucket: string; amc: string; m: Metrics };

function Dashboard() {
  
  const { schemes } = useAMFISchemes();
  const metricsByCode = useCuratedMetrics();

  const rows: Row[] = useMemo(() => {
    if (!schemes) return [];
    const byCode = new Map(schemes.map(s => [s.schemeCode, s]));
    return CURATED_CODES
      .filter(c => metricsByCode[c] && byCode.get(c))
      .map(c => {
        const s = byCode.get(c)!;
        return { code: c, name: s.schemeName, bucket: s.bucket, amc: s.amc, m: metricsByCode[c] };
      });
  }, [schemes, metricsByCode]);

  const topRanked = [...rows].sort((a, b) => (b.m.aiScore ?? 0) - (a.m.aiScore ?? 0)).slice(0, 8);
  const topSharpe = [...rows].sort((a, b) => (b.m.sharpe ?? 0) - (a.m.sharpe ?? 0)).slice(0, 8);
  const topConsistency = [...rows].sort((a, b) => (b.m.rollingWinRate ?? 0) - (a.m.rollingWinRate ?? 0)).slice(0, 8);
  const lowDD = [...rows].sort((a, b) => (b.m.maxDrawdown ?? -100) - (a.m.maxDrawdown ?? -100)).slice(0, 8);

  const universeCount = schemes ? schemes.length.toLocaleString() : "—";
  const median3Y = (() => {
    const vals = rows.map(r => r.m.r3Y).filter((v): v is number => v != null).sort((a, b) => a - b);
    if (!vals.length) return null;
    return vals[Math.floor(vals.length / 2)];
  })();
  const topAi = topRanked[0]?.m.aiScore ?? null;
  const avgDD = (() => {
    const vals = rows.map(r => r.m.maxDrawdown).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  })();

  // Top pick NAV chart
  const topCode = topRanked[0]?.code;
  const { history: topHist } = useNavHistory(topCode);
  const { history: benchHist } = useNavHistory("118825");
  const chartData = useMemo(() => {
    if (!topHist || !benchHist) return null;
    const sample = (arr: typeof topHist.series) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / 200)) === 0);
    const f = sample(topHist.series);
    const b = sample(benchHist.series);
    // index to 100 from first common date
    const start = Math.max(f[0]?.date.getTime() ?? 0, b[0]?.date.getTime() ?? 0);
    const fStart = f.find(p => p.date.getTime() >= start)?.nav ?? f[0]?.nav ?? 1;
    const bStart = b.find(p => p.date.getTime() >= start)?.nav ?? b[0]?.nav ?? 1;
    return {
      dates: f.map(p => p.date.toISOString().slice(0, 10)),
      fund: f.map(p => +(p.nav / fStart * 100).toFixed(2)),
      bench: b.slice(0, f.length).map(p => +(p.nav / bStart * 100).toFixed(2)),
    };
  }, [topHist, benchHist]);

  return (
    <AppShell title="Market Overview">
      <LiveTicker />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Universe" value={universeCount} suffix="schemes" icon={Layers} hint="AMFI live" />
        <MetricCard label="Median 3Y CAGR" value={fmt.pct(median3Y, 2)} icon={TrendingUp} hint="Curated set" />
        <MetricCard label="Top AI Score" value={fmt.score(topAi)} suffix="/ 100" icon={Sparkles} hint={topRanked[0] ? topRanked[0].amc : ""} />
        <MetricCard label="Avg Max DD" value={fmt.pct(avgDD, 1)} icon={ShieldCheck} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Top pick NAV vs NIFTY 50</div>
              <div className="font-display text-base font-semibold">{topRanked[0]?.name ?? "Loading…"}</div>
            </div>
            <Link to="/explorer" className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">Open <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {chartData ? (
            <Chart height={300} option={{
              xAxis: { type: "category", data: chartData.dates, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, interval: Math.floor(chartData.dates.length / 8) } },
              yAxis: { type: "value", scale: true, ...axisStyle },
              legend: { data: ["Fund", "NIFTY 50"], textStyle: { color: "rgba(245,247,250,0.7)" }, top: 0, right: 0 },
              series: [
                { name: "Fund", type: "line", showSymbol: false, smooth: true, data: chartData.fund,
                  lineStyle: { width: 2, color: "#7ad6ff" },
                  areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(122,214,255,0.35)" }, { offset: 1, color: "rgba(122,214,255,0)" }] } } },
                { name: "NIFTY 50", type: "line", showSymbol: false, smooth: true, data: chartData.bench,
                  lineStyle: { width: 1.5, color: "rgba(255,255,255,0.45)", type: "dashed" } },
              ],
            }} />
          ) : (
            <div className="grid h-[300px] place-items-center text-xs text-muted-foreground">Loading real NAV history…</div>
          )}
        </div>

        <RankList title="Top AI Buy Score" icon={Trophy} list={topRanked} field="aiScore" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankList title="Best Risk-Adjusted (Sharpe)" icon={ShieldCheck} list={topSharpe} field="sharpe" decimals={2} />
        <RankList title="Top Consistency (Rolling 1Y Win Rate)" icon={Activity} list={topConsistency} field="rollingWinRate" decimals={2} />
        <RankList title="Lowest Drawdown" icon={AlertTriangle} list={lowDD} field="maxDrawdown" decimals={1} suffix="%" />
      </div>

      <div className="mt-4 glass rounded-2xl p-4">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Overall Score · AI composite (Returns · Risk · Consistency · Drawdown · Benchmark · Expense)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 text-left">#</th>
                <th className="py-2 pr-3 text-left">Scheme</th>
                <th className="py-2 pr-3 text-right">3Y</th>
                <th className="py-2 pr-3 text-right">Sharpe</th>
                <th className="py-2 pr-3 text-right">Max DD</th>
                <th className="py-2 pr-3 text-right">AI Score</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {topRanked.map((r, i) => (
                <tr key={r.code} className="border-b border-border/60 hover:bg-surface/60">
                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-sans">
                    <Link to="/fund/$id" params={{ id: r.code }} className="hover:text-cyan">{r.name}</Link>
                  </td>
                  <td className="py-2 pr-3 text-right">{fmt.pct(r.m.r3Y, 2)}</td>
                  <td className="py-2 pr-3 text-right">{fmt.num(r.m.sharpe, 2)}</td>
                  <td className="py-2 pr-3 text-right">{fmt.pct(r.m.maxDrawdown, 1)}</td>
                  <td className="py-2 pr-3 text-right">
                    <span className="inline-flex min-w-[3rem] justify-center rounded-md bg-gradient-to-r from-primary/30 to-cyan/30 px-2 py-0.5 font-semibold text-cyan">
                      {fmt.score(r.m.aiScore)}
                    </span>
                  </td>
                </tr>
              ))}
              {!topRanked.length && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Warming metrics from real NAV history…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground">
          Source: AMFI India & MFAPI.in · Live NAV {rows[0]?.code ? "" : ""}
        </div>
      </div>
    </AppShell>
  );
}

function LiveTicker() {
  const ticks = useTicks();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card/60 px-4 py-2 font-mono text-xs">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
        Live · AMFI EOD
      </span>
      {!ticks && <span className="text-muted-foreground">Loading real index data…</span>}
      {ticks?.map(t => (
        <div key={t.label} className="flex items-center gap-2">
          <span className="text-muted-foreground">{t.label}</span>
          <span>{t.nav != null ? t.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</span>
          {typeof t.chg === "number" ? (
            <span className={t.chg < 0 ? "text-negative" : "text-positive"}>
              {t.chg >= 0 ? "+" : ""}{t.chg.toFixed(2)}%
            </span>
          ) : <span className="text-muted-foreground">N/A</span>}
        </div>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">USD/INR · 10Y G-SEC: N/A (no free API)</span>
    </div>
  );
}

function RankList({ title, icon: Icon, list, field, decimals = 0, suffix = "" }: {
  title: string; icon: any; list: Row[]; field: keyof Metrics; decimals?: number; suffix?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <Icon className="h-4 w-4 text-cyan" />
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-muted-foreground">Loading real metrics…</div>}
        {list.slice(0, 6).map((r, i) => (
          <Link to="/fund/$id" params={{ id: r.code }} key={r.code}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface/40 px-2.5 py-2 transition hover:border-cyan/40 hover:bg-surface">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-cyan font-mono text-[10px] font-bold text-primary-foreground">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{r.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{r.amc} · {r.bucket}</div>
            </div>
            <div className="font-mono text-xs text-cyan">{fmt.num(r.m[field] as number | null, decimals)}{suffix}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
