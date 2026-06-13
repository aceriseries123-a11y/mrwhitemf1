/**
 * compare.tsx — Fund Compare
 *
 * Will provide side-by-side comparison of up to 4 funds across rolling
 * returns, drawdowns, Sharpe ratio, and QuantFund Score.
 * Requires the NAV history scoring engine — currently in development.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { GitCompare, BarChart3, TrendingUp, ShieldCheck, Target } from "lucide-react";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Fund Compare — QuantFund" },
      { name: "description", content: "Side-by-side mutual fund comparison across rolling returns, drawdowns, Sharpe ratio and QuantFund Score." },
      { property: "og:title", content: "Fund Compare — QuantFund" },
      { property: "og:description", content: "Compare Indian mutual funds head-to-head on quant-driven metrics." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/compare" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/compare" }],
  }),
  component: Compare,
});

const PLANNED_FEATURES = [
  {
    icon: BarChart3,
    title: "Side-by-side NAV chart",
    desc: "Indexed NAV from a common start date, any time window up to fund inception.",
  },
  {
    icon: TrendingUp,
    title: "Metric comparison table",
    desc: "1Y, 3Y, 5Y CAGR · Sharpe · Sortino · Max Drawdown · QuantFund Score — all in one row per fund.",
  },
  {
    icon: ShieldCheck,
    title: "Rolling return heatmaps",
    desc: "Monthly return heatmaps for up to 4 funds side by side to reveal consistency patterns.",
  },
  {
    icon: Target,
    title: "Risk-return scatter",
    desc: "Annualised return vs annualised volatility plot with category peers as context.",
  },
];

function Compare() {
  return (
    <AppShell title="Fund Compare">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <GitCompare className="h-6 w-6 text-cyan" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Fund Compare</h1>
          <span className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Coming soon
          </span>
        </div>

        <div className="mb-6 rounded-sm border border-border bg-surface/60 p-4 text-sm text-muted-foreground">
          Fund Compare will allow head-to-head comparison of up to 4 funds using real NAV history.
          While this page is being built, you can compare funds individually via the{" "}
          <Link to="/explorer" className="text-cyan underline underline-offset-2">Fund Explorer</Link>
          {" "}→ fund detail page, or see category leaders on the{" "}
          <Link to="/rankings" className="text-cyan underline underline-offset-2">Rankings</Link> page.
        </div>

        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Planned features
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANNED_FEATURES.map((f) => (
            <div key={f.title} className="rounded-sm border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <f.icon className="h-4 w-4 text-cyan" />
                <span className="text-sm font-medium text-foreground">{f.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
