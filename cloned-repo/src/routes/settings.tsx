import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAMFISchemes, filterActiveSchemes } from "@/lib/live-data";
import { RISK_FREE_RATE_LABEL } from "@/lib/risk-free-rate";
import {
  Settings2, Database, BarChart2, AlertTriangle, TrendingUp,
  ShieldCheck, Activity, Info,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — QuantFund" },
      { name: "description", content: "Methodology, data sources, and assumptions used by QuantFund." },
      { property: "og:title", content: "Settings — QuantFund" },
      { property: "og:description", content: "Methodology and data sources for the QuantFund terminal." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/settings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/settings" }],
  }),
  component: Settings,
});

function Settings() {
  const { data: schemes, isLoading } = useAMFISchemes();
  const universe = schemes ? filterActiveSchemes(schemes).length : null;
  const asOf = schemes?.[0]?.date ?? "—";

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Methodology, data sources & assumptions
          </p>
        </div>

        {/* Score methodology highlight */}
        <div className="rounded-xl border border-cyan/30 bg-cyan/[0.05] p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-cyan" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">QuantFund Score — How It Works</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "3Y CAGR", weight: "35%", icon: TrendingUp, note: "Long-run compounding" },
              { label: "Sharpe Ratio", weight: "25%", icon: ShieldCheck, note: "Return per unit of risk" },
              { label: "Max Drawdown", weight: "20%", icon: TrendingUp, note: "Worst peak-to-trough (lower better)" },
              { label: "1Y Rolling +%", weight: "20%", icon: Activity, note: "Consistency of positive 1Y periods" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                  <span className="font-mono text-[10px] font-bold text-cyan">{f.weight}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{f.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            All factors computed from real AMFI NAV history. Scores are category-scoped — a Large Cap score cannot be compared
            to a Small Cap score. Not AI. Not a return prediction. Risk-free rate: {RISK_FREE_RATE_LABEL}.
          </p>
        </div>

        {/* Detail grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Methodology Defaults" icon={Settings2}>
            <Row label="Default benchmark" value="Nifty 500 TRI (planned)" />
            <Row label="Rolling window" value="252 trading days (1Y)" />
            <Row label="Risk-free rate" value={RISK_FREE_RATE_LABEL} />
            <Row label="Currency" value="INR (₹)" />
            <Row label="Score normalisation" value="Raw composite · within-category only" />
          </Section>

          <Section title="Data Sources" icon={Database}>
            <Row label="Scheme universe" value="AMFI NAVAll (live)" />
            <Row
              label="Open-ended schemes"
              value={isLoading ? "Loading…" : universe != null ? universe.toLocaleString() : "—"}
              tone={universe != null ? "positive" : undefined}
            />
            <Row label="NAV history" value="mfapi.in (AMFI community mirror)" />
            <Row label="Latest NAV date" value={asOf} />
            <Row label="Market indices" value="Yahoo Finance (NIFTY 50, SENSEX, Gold, USD/INR)" tone="positive" />
          </Section>

          <Section title="QuantFund Score" icon={BarChart2}>
            <Row label="Type" value="Transparent composite (not AI)" />
            <Row label="Factors" value="CAGR3Y · Sharpe · MaxDD · 1Y Rolling %" />
            <Row label="Weights" value="35 / 25 / 20 / 20" />
            <Row label="Normalised" value="No — raw composite, within-category" />
            <Row label="Recalculated" value="On every fund detail page load (12h cache)" />
          </Section>

          <Section title="Not Available" icon={AlertTriangle}>
            <Row label="AUM" value="Not in AMFI feed" />
            <Row label="Expense ratio" value="Not in AMFI feed" />
            <Row label="Holdings / sector" value="Not in AMFI feed" />
            <Row label="Real-time intraday NAV" value="AMFI publishes EOD only" />
            <Row label="Benchmark TRI series" value="Planned (benchmark comparison)" />
          </Section>
        </div>

        {/* Transparency note */}
        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Transparency</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            QuantFund is a research-only platform for educational use. It does not provide investment advice.
            All metrics are backward-looking and computed from historical NAV data published by AMFI India.
            Past performance is not indicative of future returns. Market ticker data (NIFTY 50, SENSEX, Gold, USD/INR)
            is sourced from Yahoo Finance via the <span className="font-mono text-foreground">/api/public/market-ticks</span> proxy
            and is refreshed every 5 minutes.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  title, icon: Icon, children,
}: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <Icon className="h-4 w-4 text-cyan" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">{title}</span>
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function Row({
  label, value, tone,
}: {
  label: string; value: string; tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-foreground";
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right font-mono text-[12px] ${toneClass}`}>{value}</span>
    </div>
  );
}
