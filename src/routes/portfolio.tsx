import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { useAMFISchemes, useCuratedMetrics, fmt, CURATED_CODES, type Metrics } from "@/lib/live-data";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio Analyzer — QuantFund" }] }),
  component: Portfolio,
});

type Holding = { code: string; weight: number };

function Portfolio() {
  const { schemes } = useAMFISchemes();
  const metrics = useCuratedMetrics();
  const [holdings, setHoldings] = useState<Holding[]>(CURATED_CODES.slice(0, 4).map(c => ({ code: c, weight: 25 })));
  const [q, setQ] = useState("");

  const total = holdings.reduce((s, h) => s + h.weight, 0);
  const enriched = holdings.map(h => {
    const s = schemes?.find(x => x.schemeCode === h.code);
    const m: Metrics | undefined = metrics[h.code];
    return { ...h, name: s?.schemeName ?? h.code, bucket: s?.bucket ?? "—", m, w: h.weight / Math.max(total, 1) };
  });

  const expRet = enriched.reduce((s, x) => s + x.w * (x.m?.r3Y ?? 0), 0);
  const expVol = Math.sqrt(enriched.reduce((s, x) => s + Math.pow(x.w * (x.m?.stdDev ?? 0), 2), 0));
  const expSharpe = expVol > 0 ? expRet / expVol : 0;
  const div = Math.min(100, Math.round(100 - Math.max(...enriched.map(n => n.w), 0) * 100));

  const results = useMemo(() => {
    if (!q || !schemes) return [];
    const ql = q.toLowerCase();
    return schemes.filter(s => s.schemeName.toLowerCase().includes(ql) || s.schemeCode.includes(ql)).slice(0, 6);
  }, [q, schemes]);

  return (
    <AppShell title="Portfolio Analyzer">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-4 lg:col-span-2">
          <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Portfolio holdings</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Add fund (search by name or AMFI code)…"
            className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none" />
          {results.length > 0 && (
            <div className="mb-3 space-y-1 rounded-lg border border-border bg-surface/60 p-2">
              {results.map(s => (
                <button key={s.schemeCode} onClick={() => { setHoldings(arr => [...arr, { code: s.schemeCode, weight: 10 }]); setQ(""); }}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted">
                  <span>{s.schemeName}</span><Plus className="h-3.5 w-3.5 text-cyan" />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {enriched.map((h, i) => (
              <div key={h.code + i} className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{h.name}</div>
                  <div className="text-[11px] text-muted-foreground">{h.bucket} · Sharpe {fmt.num(h.m?.sharpe, 2)} · DD {fmt.pct(h.m?.maxDrawdown, 1)}</div>
                </div>
                <input type="number" value={h.weight} onChange={e => setHoldings(arr => arr.map((x, ix) => ix === i ? { ...x, weight: +e.target.value } : x))}
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-right font-mono text-xs" />
                <span className="text-xs text-muted-foreground">%</span>
                <button onClick={() => setHoldings(arr => arr.filter((_, ix) => ix !== i))}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-negative" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right text-xs text-muted-foreground">Total weight: <span className={total === 100 ? "text-positive" : "text-warning"}>{total}%</span></div>
        </div>

        <div className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Expected metrics (real)</div>
            <div className="mt-3 grid grid-cols-2 gap-3 font-mono">
              <Stat label="Expected CAGR" v={fmt.pct(expRet, 2)} tone="positive" />
              <Stat label="Expected Vol" v={fmt.pct(expVol, 2)} />
              <Stat label="Sharpe (est)" v={expSharpe.toFixed(2)} tone="cyan" />
              <Stat label="Diversification" v={`${div}/100`} />
            </div>
            <div className="mt-3 text-[10px] text-muted-foreground">Derived from MFAPI.in NAV history (3Y window).</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, v, tone }: { label: string; v: string; tone?: "positive" | "cyan" }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone === "positive" ? "text-positive" : tone === "cyan" ? "text-cyan" : ""}`}>{v}</div>
    </div>
  );
}
