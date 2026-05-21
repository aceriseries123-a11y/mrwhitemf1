import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useMemo } from "react";
import { useAMFISchemes, useCuratedMetrics, fmt, type Metrics } from "@/lib/live-data";

type Row = { code: string; name: string; bucket: string; m: Metrics };

type Preset = { id: string; label: string; key: keyof Metrics; desc: string; asc: boolean };
const PRESETS: Preset[] = [
  { id: "max-growth", label: "Maximum Growth", key: "r5Y", desc: "Highest 5Y CAGR", asc: false },
  { id: "balanced", label: "AI Buy Score", key: "aiScore", desc: "Composite AI score", asc: false },
  { id: "low-risk", label: "Low Risk", key: "stdDev", desc: "Lowest volatility", asc: true },
  { id: "consistency", label: "Long-Term Consistency", key: "rollingWinRate", desc: "Highest rolling 1Y win rate", asc: false },
  { id: "sharpe", label: "High Sharpe", key: "sharpe", desc: "Best risk-adjusted return", asc: false },
  { id: "low-dd", label: "Low Drawdown", key: "maxDrawdown", desc: "Smallest drawdown", asc: false },
];

export const Route = createFileRoute("/rankings")({
  head: () => ({ meta: [{ title: "Rankings — QuantFund" }] }),
  component: Rankings,
});

function Rankings() {
  const [active, setActive] = useState(PRESETS[1]);
  const { schemes } = useAMFISchemes();
  const m = useCuratedMetrics();

  const rows: Row[] = useMemo(() => {
    if (!schemes) return [];
    const byCode = new Map(schemes.map(s => [s.schemeCode, s]));
    return Object.entries(m)
      .filter(([c]) => byCode.has(c))
      .map(([c, mm]) => ({ code: c, name: byCode.get(c)!.schemeName, bucket: byCode.get(c)!.bucket, m: mm }));
  }, [schemes, m]);

  const list = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a.m[active.key] as number | null;
      const vb = b.m[active.key] as number | null;
      if (va == null) return 1;
      if (vb == null) return -1;
      return active.asc ? va - vb : vb - va;
    }).slice(0, 30);
  }, [rows, active]);

  return (
    <AppShell title="Rankings">
      <div className="glass mb-4 rounded-2xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setActive(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${active.id === p.id ? "border-cyan/60 bg-cyan/10 text-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{active.desc} · Ranking computed from real NAV history across curated funds.</div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-surface/80 text-muted-foreground">
              <tr className="border-b border-border">
                {["Rank","Scheme","Category","3Y CAGR","Sharpe","Max DD","Cons.","AI"].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {list.length === 0 && <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">Loading real metrics…</td></tr>}
              {list.map((f, i) => (
                <tr key={f.code} className="border-b border-border/60 hover:bg-surface/60">
                  <td className="px-3 py-2"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-bold ${i < 3 ? "bg-gradient-to-br from-primary to-cyan text-primary-foreground" : "bg-surface text-muted-foreground"}`}>{i + 1}</span></td>
                  <td className="px-3 py-2"><Link to="/fund/$id" params={{ id: f.code }} className="font-sans hover:text-cyan">{f.name}</Link></td>
                  <td className="px-3 py-2 text-muted-foreground">{f.bucket}</td>
                  <td className="px-3 py-2 text-positive">{fmt.pct(f.m.r3Y, 2)}</td>
                  <td className="px-3 py-2">{fmt.num(f.m.sharpe, 2)}</td>
                  <td className="px-3 py-2 text-negative">{fmt.pct(f.m.maxDrawdown, 1)}</td>
                  <td className="px-3 py-2">{fmt.num((f.m.rollingWinRate ?? null) != null ? (f.m.rollingWinRate as number) * 100 : null, 0)}</td>
                  <td className="px-3 py-2 text-cyan">{fmt.score(f.m.aiScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">Source: AMFI India & MFAPI.in</div>
      </div>
    </AppShell>
  );
}
