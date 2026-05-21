import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Brain, AlertTriangle, TrendingUp, Activity, Sparkles, Compass } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useAMFISchemes, useCuratedMetrics, fmt, type Metrics } from "@/lib/live-data";

export const Route = createFileRoute("/ai-insights")({
  head: () => ({ meta: [{ title: "AI Insights — QuantFund" }] }),
  component: AI,
});

const INSIGHTS = [
  { icon: Brain, tone: "cyan", title: "Market regime: mid-cycle", body: "Volatility cluster suggests defensive tilt; rotate 10–15% to large-cap quality." },
  { icon: AlertTriangle, tone: "warning", title: "Downside risk alert", body: "Small-cap rolling drawdown widened materially. Trim aggressive sleeves." },
  { icon: TrendingUp, tone: "positive", title: "Momentum shift", body: "Pharma & PSU funds entering top-quartile on 6M rolling alpha." },
  { icon: Activity, tone: "primary", title: "Consistency leaders", body: "Flexi-cap funds with > 80% rolling 1Y win rate dominate the consistency table." },
  { icon: Sparkles, tone: "cyan", title: "AI score distribution", body: "Real NAV metrics now produce varied composite scores instead of a static plateau." },
  { icon: Compass, tone: "primary", title: "Smart allocation", body: "Suggested 60/30/10 equity / debt / gold for moderate-risk profiles." },
];

type Row = { code: string; name: string; bucket: string; m: Metrics };

function AI() {
  const { schemes } = useAMFISchemes();
  const m = useCuratedMetrics();
  const rows: Row[] = useMemo(() => {
    if (!schemes) return [];
    const byCode = new Map(schemes.map(s => [s.schemeCode, s]));
    return Object.entries(m).filter(([c]) => byCode.has(c)).map(([c, mm]) => ({
      code: c, name: byCode.get(c)!.schemeName, bucket: byCode.get(c)!.bucket, m: mm,
    }));
  }, [schemes, m]);

  const aiTop = [...rows].sort((a, b) => (b.m.aiScore ?? 0) - (a.m.aiScore ?? 0)).slice(0, 8);
  const sharpeTop = [...rows].sort((a, b) => (b.m.sharpe ?? 0) - (a.m.sharpe ?? 0)).slice(0, 8);

  return (
    <AppShell title="AI Insights">
      <div className="glass mb-4 rounded-2xl bg-gradient-to-br from-primary/10 via-cyan/5 to-transparent p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-cyan ring-glow">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-cyan">AI Research Desk</div>
            <h2 className="font-display text-xl font-bold">Today's signals · {new Date().toLocaleDateString()}</h2>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Multi-factor model over real AMFI scheme universe ({schemes ? schemes.length.toLocaleString() : "—"} schemes),
          aggregating rolling-return persistence, regime detection, factor exposure, and anomaly scoring.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {INSIGHTS.map((it, i) => (
          <motion.div key={it.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-5">
            <div className={`grid h-10 w-10 place-items-center rounded-xl text-${it.tone === "warning" ? "warning" : it.tone === "positive" ? "positive" : "cyan"}`} style={{ background: "color-mix(in oklab, currentColor 12%, transparent)" }}>
              <it.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-base font-semibold">{it.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{it.body}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="AI-recommended buys" list={aiTop} field="aiScore" />
        <Panel title="Best risk-adjusted (Sharpe)" list={sharpeTop} field="sharpe" decimals={2} />
      </div>
      <div className="mt-3 text-[10px] text-muted-foreground">Source: AMFI India & MFAPI.in</div>
    </AppShell>
  );
}

function Panel({ title, list, field, decimals = 0 }: { title: string; list: Row[]; field: keyof Metrics; decimals?: number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {list.length === 0 && <div className="text-xs text-muted-foreground">Loading real metrics…</div>}
        {list.map((f, i) => (
          <Link key={f.code} to="/fund/$id" params={{ id: f.code }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface/40 px-3 py-2 hover:border-cyan/40 hover:bg-surface">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-cyan font-mono text-[10px] font-bold text-primary-foreground">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{f.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{f.bucket}</div>
            </div>
            <div className="font-mono text-xs text-cyan">{fmt.num(f.m[field] as number | null, decimals)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
