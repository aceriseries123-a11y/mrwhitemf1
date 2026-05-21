import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Chart, axisStyle } from "@/components/Chart";
import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import {
  useAMFISchemes, useNavHistory, useMetrics, fmt, CURATED_CODES,
} from "@/lib/live-data";

export const Route = createFileRoute("/compare")({
  head: () => ({ meta: [{ title: "Fund Compare — QuantFund" }] }),
  component: Compare,
});

const COLORS = ["#7ad6ff", "#2dd4a8", "#f59e0b", "#a78bfa", "#ef4444"];

function Compare() {
  const { schemes } = useAMFISchemes();
  const [codes, setCodes] = useState<string[]>(CURATED_CODES.slice(0, 3));
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!q || !schemes) return [];
    const ql = q.toLowerCase();
    return schemes.filter(s => !codes.includes(s.schemeCode) &&
      (s.schemeName.toLowerCase().includes(ql) || s.schemeCode.includes(ql))).slice(0, 6);
  }, [q, schemes, codes]);

  return (
    <AppShell title="Fund Compare">
      <div className="glass mb-4 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          {codes.map((c, i) => {
            const s = schemes?.find(x => x.schemeCode === c);
            return (
              <span key={c} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                {s?.schemeName || c}
                <button onClick={() => setCodes(arr => arr.filter(x => x !== c))}><X className="h-3 w-3 text-muted-foreground" /></button>
              </span>
            );
          })}
          {codes.length < 5 && (
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="+ add fund (name or AMFI code)"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none" />
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-2 space-y-1 rounded-lg border border-border bg-surface/60 p-2">
            {results.map(s => (
              <button key={s.schemeCode} onClick={() => { setCodes(arr => [...arr, s.schemeCode]); setQ(""); }}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted">
                <span>{s.schemeName}</span><Plus className="h-3.5 w-3.5 text-cyan" />
              </button>
            ))}
          </div>
        )}
      </div>

      <CompareGrid codes={codes} schemes={schemes ?? []} />
      <div className="mt-3 text-[10px] text-muted-foreground">Source: AMFI India & MFAPI.in</div>
    </AppShell>
  );
}

function CompareGrid({ codes, schemes }: { codes: string[]; schemes: { schemeCode: string; schemeName: string }[] }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">NAV growth · Indexed to 100</div>
          <NavChart codes={codes} schemes={schemes} />
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Metrics comparison</div>
          <MetricsTable codes={codes} schemes={schemes} />
        </div>
      </div>
    </>
  );
}

function NavChart({ codes, schemes }: { codes: string[]; schemes: { schemeCode: string; schemeName: string }[] }) {
  // Fetch all NAVs
  const h0 = useNavHistory(codes[0]);
  const h1 = useNavHistory(codes[1]);
  const h2 = useNavHistory(codes[2]);
  const h3 = useNavHistory(codes[3]);
  const h4 = useNavHistory(codes[4]);
  const hist = [h0, h1, h2, h3, h4];
  const ready = codes.map((_, i) => hist[i].history);

  const data = useMemo(() => {
    const lists = ready.filter(Boolean) as NonNullable<typeof ready[number]>[];
    if (!lists.length) return null;
    const minStart = lists.reduce((d, h) => h.series[0].date > d ? h.series[0].date : d, lists[0].series[0].date);
    const series = lists.map(h => {
      const trimmed = h.series.filter(p => p.date >= minStart);
      const start = trimmed[0]?.nav ?? 1;
      const step = Math.max(1, Math.floor(trimmed.length / 200));
      return trimmed.filter((_, i) => i % step === 0).map(p => +(p.nav / start * 100).toFixed(2));
    });
    const dates0 = lists[0].series.filter(p => p.date >= minStart);
    const step0 = Math.max(1, Math.floor(dates0.length / 200));
    return {
      dates: dates0.filter((_, i) => i % step0 === 0).map(p => p.date.toISOString().slice(0, 10)),
      series,
    };
  }, [ready]);

  if (!data) return <div className="grid h-[340px] place-items-center text-xs text-muted-foreground">Loading…</div>;
  return (
    <Chart height={340} option={{
      xAxis: { type: "category", data: data.dates, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, interval: Math.floor(data.dates.length / 8) } },
      yAxis: { type: "value", scale: true, ...axisStyle },
      legend: { data: codes.map(c => schemes.find(s => s.schemeCode === c)?.schemeName.slice(0, 25) ?? c), textStyle: { color: "rgba(245,247,250,0.7)", fontSize: 10 }, top: 0 },
      series: data.series.map((d, i) => ({
        name: schemes.find(s => s.schemeCode === codes[i])?.schemeName.slice(0, 25) ?? codes[i],
        type: "line", showSymbol: false, smooth: true,
        data: d, lineStyle: { width: 2, color: COLORS[i] },
      })),
    }} />
  );
}

function MetricsTable({ codes, schemes }: { codes: string[]; schemes: { schemeCode: string; schemeName: string }[] }) {
  const m0 = useMetrics(codes[0]).metrics;
  const m1 = useMetrics(codes[1]).metrics;
  const m2 = useMetrics(codes[2]).metrics;
  const m3 = useMetrics(codes[3]).metrics;
  const m4 = useMetrics(codes[4]).metrics;
  const all = [m0, m1, m2, m3, m4];
  const rows: [string, (m: any) => string][] = [
    ["1Y CAGR", m => fmt.pct(m?.r1Y, 2)],
    ["3Y CAGR", m => fmt.pct(m?.r3Y, 2)],
    ["5Y CAGR", m => fmt.pct(m?.r5Y, 2)],
    ["Sharpe", m => fmt.num(m?.sharpe, 2)],
    ["Sortino", m => fmt.num(m?.sortino, 2)],
    ["Alpha", m => fmt.num(m?.alpha, 2)],
    ["Beta", m => fmt.num(m?.beta, 2)],
    ["Max DD", m => fmt.pct(m?.maxDrawdown, 1)],
    ["AI Score", m => fmt.score(m?.aiScore)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-surface/80 text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Metric</th>
            {codes.map((c, i) => (
              <th key={c} className="px-2 py-2 text-left text-[10px] font-semibold uppercase">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />{schemes.find(s => s.schemeCode === c)?.schemeName.slice(0, 14) ?? c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map(([label, get]) => (
            <tr key={label} className="border-b border-border/60">
              <td className="px-2 py-2 text-muted-foreground">{label}</td>
              {codes.map((c, i) => <td key={c} className="px-2 py-2">{get(all[i])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
