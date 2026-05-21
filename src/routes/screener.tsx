import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useMemo } from "react";
import { Save, Download } from "lucide-react";
import { useAMFISchemes, useCuratedMetrics, fmt, type Metrics, type FundGroup } from "@/lib/live-data";

export const Route = createFileRoute("/screener")({
  head: () => ({ meta: [{ title: "Screener — QuantFund" }] }),
  component: Screener,
});

function Range({ label, value, onChange, min, max, step = 0.1, fmt: format = (v: number) => v.toFixed(1) }:
  { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-cyan">≥ {format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        className="w-full accent-[oklch(0.72_0.16_235)]" />
    </div>
  );
}

const GROUPS: ("All" | FundGroup)[] = ["All", "Equity", "Hybrid", "Debt", "Index", "Commodity", "International"];

function Screener() {
  const { schemes } = useAMFISchemes();
  const m = useCuratedMetrics();
  const [group, setGroup] = useState<"All" | FundGroup>("All");
  const [minSharpe, setMinSharpe] = useState(0.6);
  const [minCagr, setMinCagr] = useState(10);
  const [maxDD, setMaxDD] = useState(-30);
  const [minAi, setMinAi] = useState(50);

  type R = { code: string; name: string; bucket: string; group: FundGroup; m: Metrics };
  const rows: R[] = useMemo(() => {
    if (!schemes) return [];
    const byCode = new Map(schemes.map(s => [s.schemeCode, s]));
    return Object.entries(m).filter(([c]) => byCode.has(c)).map(([c, mm]) => {
      const s = byCode.get(c)!;
      return { code: c, name: s.schemeName, bucket: s.bucket, group: s.group, m: mm };
    });
  }, [schemes, m]);

  const out = useMemo(() => rows.filter(f =>
    (group === "All" || f.group === group) &&
    (f.m.sharpe == null || f.m.sharpe >= minSharpe) &&
    (f.m.r3Y == null || f.m.r3Y >= minCagr) &&
    (f.m.maxDrawdown == null || f.m.maxDrawdown >= maxDD) &&
    (f.m.aiScore == null || f.m.aiScore >= minAi)
  ).sort((a, b) => (b.m.aiScore ?? 0) - (a.m.aiScore ?? 0)).slice(0, 50), [rows, group, minSharpe, minCagr, maxDD, minAi]);

  return (
    <AppShell title="Screener">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="glass space-y-5 rounded-2xl p-4 lg:col-span-1">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Group</div>
            <select value={group} onChange={e => setGroup(e.target.value as any)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              {GROUPS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <Range label="Sharpe Ratio" value={minSharpe} onChange={setMinSharpe} min={0} max={3} step={0.1} fmt={v => v.toFixed(2)} />
          <Range label="3Y CAGR (%)" value={minCagr} onChange={setMinCagr} min={0} max={30} step={0.5} fmt={v => v.toFixed(1) + "%"} />
          <Range label="Max Drawdown ≥" value={maxDD} onChange={setMaxDD} min={-60} max={0} step={1} fmt={v => v + "%"} />
          <Range label="AI Score ≥" value={minAi} onChange={setMinAi} min={0} max={95} step={1} fmt={v => v.toString()} />
          <div className="flex gap-2">
            <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-cyan px-3 py-2 text-xs font-semibold text-primary-foreground"><Save className="h-3.5 w-3.5"/> Save</button>
            <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs"><Download className="h-3.5 w-3.5"/> Export</button>
          </div>
        </div>

        <div className="glass overflow-hidden rounded-2xl lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs">
            <span className="font-mono text-muted-foreground">{out.length} matches (curated universe)</span>
            <span className="text-muted-foreground">sorted by AI Score</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-surface/80 text-muted-foreground">
                <tr className="border-b border-border">
                  {["#","Scheme","Category","Sharpe","3Y CAGR","Max DD","AI"].map(h => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {out.map((f, i) => (
                  <tr key={f.code} className="border-b border-border/60 hover:bg-surface/60">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2"><Link to="/fund/$id" params={{ id: f.code }} className="font-sans hover:text-cyan">{f.name}</Link></td>
                    <td className="px-3 py-2 text-muted-foreground">{f.bucket}</td>
                    <td className="px-3 py-2">{fmt.num(f.m.sharpe, 2)}</td>
                    <td className="px-3 py-2 text-positive">{fmt.pct(f.m.r3Y, 2)}</td>
                    <td className="px-3 py-2 text-negative">{fmt.pct(f.m.maxDrawdown, 1)}</td>
                    <td className="px-3 py-2 text-cyan">{fmt.score(f.m.aiScore)}</td>
                  </tr>
                ))}
                {out.length === 0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">No funds match (or metrics still loading).</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">Source: AMFI India & MFAPI.in</div>
        </div>
      </div>
    </AppShell>
  );
}
