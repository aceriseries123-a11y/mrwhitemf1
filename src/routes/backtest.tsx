import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Chart, axisStyle } from "@/components/Chart";
import { useMemo, useState } from "react";
import { useAMFISchemes, useNavHistory, CURATED_CODES } from "@/lib/live-data";

export const Route = createFileRoute("/backtest")({
  head: () => ({ meta: [{ title: "Backtesting — QuantFund" }] }),
  component: Backtest,
});

function Backtest() {
  const { schemes } = useAMFISchemes();
  const [mode, setMode] = useState<"SIP" | "Lumpsum">("SIP");
  const [amount, setAmount] = useState(10000);
  const [years, setYears] = useState(5);
  const [code, setCode] = useState(CURATED_CODES[0]);

  const { history } = useNavHistory(code);
  const { history: bench } = useNavHistory("118825");

  const result = useMemo(() => {
    if (!history || !bench) return null;
    const cutoff = new Date(history.series[history.series.length - 1].date);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const f = history.series.filter(p => p.date >= cutoff);
    const b = bench.series.filter(p => p.date >= cutoff);
    if (f.length < 30 || b.length < 30) return null;
    let units = 0, benchUnits = 0, invested = 0;
    const monthly = Math.max(1, Math.floor(f.length / (years * 12)));
    const wealth: number[] = [];
    const benchWealth: number[] = [];
    for (let i = 0; i < f.length; i++) {
      if (mode === "SIP" && i % monthly === 0) {
        units += amount / f[i].nav;
        const bp = b[Math.min(i, b.length - 1)].nav;
        benchUnits += amount / bp;
        invested += amount;
      }
      if (mode === "Lumpsum" && i === 0) {
        const totInvest = amount * years * 12;
        units = totInvest / f[i].nav;
        benchUnits = totInvest / b[0].nav;
        invested = totInvest;
      }
      wealth.push(Math.round(units * f[i].nav));
      benchWealth.push(Math.round(benchUnits * b[Math.min(i, b.length - 1)].nav));
    }
    return {
      dates: f.map(p => p.date.toISOString().slice(0, 10)),
      wealth, benchWealth, invested,
      final: wealth[wealth.length - 1], benchFinal: benchWealth[benchWealth.length - 1],
    };
  }, [history, bench, mode, amount, years]);

  return (
    <AppShell title="Backtesting">
      <div className="glass mb-4 grid grid-cols-2 gap-3 rounded-2xl p-4 md:grid-cols-4">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Mode</div>
          <div className="flex rounded-lg border border-border bg-surface p-1 text-xs">
            {(["SIP", "Lumpsum"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md px-2 py-1.5 ${mode === m ? "bg-gradient-to-br from-primary to-cyan text-primary-foreground" : "text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{mode === "SIP" ? "Monthly ₹" : "Total ₹"}</div>
          <input type="number" value={amount} onChange={e => setAmount(+e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Years</div>
          <input type="number" value={years} onChange={e => setYears(Math.max(1, Math.min(20, +e.target.value)))} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Fund</div>
          <select value={code} onChange={e => setCode(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {CURATED_CODES.map(c => {
              const s = schemes?.find(x => x.schemeCode === c);
              return <option key={c} value={c}>{s?.schemeName ?? c}</option>;
            })}
          </select>
        </div>
      </div>

      {!result && <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading real NAV history…</div>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Invested" v={`₹${result.invested.toLocaleString()}`} />
            <Card label="Final Value" v={`₹${result.final.toLocaleString()}`} tone="cyan" />
            <Card label="NIFTY 50 Value" v={`₹${result.benchFinal.toLocaleString()}`} />
            <Card label="Alpha vs Bench" v={`${(((result.final - result.benchFinal) / result.benchFinal) * 100).toFixed(1)}%`} tone="positive" />
          </div>

          <div className="mt-4 glass rounded-2xl p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Wealth growth (real NAV)</div>
            <Chart height={320} option={{
              xAxis: { type: "category", data: result.dates, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, interval: Math.floor(result.dates.length / 8) } },
              yAxis: { type: "value", ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => "₹" + (v / 100000).toFixed(1) + "L" } },
              legend: { data: ["Fund", "NIFTY 50"], textStyle: { color: "rgba(245,247,250,0.7)" }, top: 0, right: 0 },
              series: [
                { name: "Fund", type: "line", showSymbol: false, smooth: true, data: result.wealth,
                  lineStyle: { color: "#7ad6ff", width: 2 },
                  areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(122,214,255,0.35)" }, { offset: 1, color: "rgba(122,214,255,0)" }] } } },
                { name: "NIFTY 50", type: "line", showSymbol: false, smooth: true, data: result.benchWealth,
                  lineStyle: { color: "rgba(255,255,255,0.45)", width: 1.5, type: "dashed" } },
              ],
            }} />
          </div>
        </>
      )}
      <div className="mt-3 text-[10px] text-muted-foreground">Source: AMFI India & MFAPI.in</div>
    </AppShell>
  );
}

function Card({ label, v, tone }: { label: string; v: string; tone?: "cyan" | "positive" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold ${tone === "cyan" ? "text-cyan" : tone === "positive" ? "text-positive" : ""}`}>{v}</div>
    </div>
  );
}
