/**
 * backtest.tsx — Portfolio Backtesting
 *
 * Will simulate mutual fund portfolio performance against benchmark TRI
 * series using historical AMFI NAV data, including SIP simulation,
 * lump-sum comparison, and rolling period analysis.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { History, LineChart, Calendar, TrendingUp, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Backtesting — QuantFund" },
      { name: "description", content: "Simulate mutual fund portfolio performance against benchmark TRI series using historical AMFI NAV data." },
      { property: "og:title", content: "Backtesting — QuantFund" },
      { property: "og:description", content: "Portfolio backtests with rolling returns and benchmark TRI comparison." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/backtest" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/backtest" }],
  }),
  component: Backtest,
});

const PLANNED_FEATURES = [
  {
    icon: LineChart,
    title: "Lump-sum growth simulation",
    desc: "Starting capital grown at actual historical NAVs — exact rupee values, no approximations.",
  },
  {
    icon: Calendar,
    title: "SIP simulator",
    desc: "Monthly SIP at real NAV history. Shows total invested, corpus, XIRR, and unit accumulation.",
  },
  {
    icon: TrendingUp,
    title: "Benchmark comparison",
    desc: "Fund growth vs category benchmark TRI (Nifty 100 for Large Cap, Midcap 150 for Mid Cap, etc.).",
  },
  {
    icon: ShieldCheck,
    title: "Rolling period analysis",
    desc: "Distribution of 1Y, 3Y, 5Y returns across all historical start dates — reveals consistency, not just one lucky period.",
  },
];

function Backtest() {
  return (
    <AppShell title="Backtesting">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <History className="h-6 w-6 text-cyan" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Backtesting</h1>
          <span className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Coming soon
          </span>
        </div>

        <div className="mb-6 rounded-sm border border-border bg-surface/60 p-4 text-sm text-muted-foreground">
          Backtesting will let you simulate lump-sum and SIP investments in any fund over any
          historical period, compared against the category benchmark TRI. All numbers come from
          real AMFI NAV history — no approximated index proxies.
          In the meantime, view trailing returns and NAV charts for any fund via the{" "}
          <Link to="/explorer" className="text-cyan underline underline-offset-2">Fund Explorer</Link>.
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

        <div className="mt-6 rounded-sm border border-border bg-surface/60 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Data: AMFI NAVAll (up to 20Y per fund) · Benchmark TRI: NSE / CRISIL indices
        </div>
      </div>
    </AppShell>
  );
}
