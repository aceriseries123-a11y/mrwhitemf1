/**
 * portfolio.tsx — Portfolio Analyzer
 *
 * Will compute aggregate portfolio analytics: overlap detection,
 * category exposure, diversification score, and risk-adjusted returns
 * across a user-defined set of funds.
 * Requires NAV history scoring engine — currently in development.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Briefcase, PieChart, Layers, TrendingUp, GitMerge } from "lucide-react";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio Analyzer — QuantFund" },
      { name: "description", content: "Aggregate portfolio analytics: overlap detection, category exposure, diversification score and risk-adjusted returns." },
      { property: "og:title", content: "Portfolio Analyzer — QuantFund" },
      { property: "og:description", content: "Analyze your mutual fund portfolio with institutional-grade aggregate metrics." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/portfolio" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/portfolio" }],
  }),
  component: Portfolio,
});

const PLANNED_FEATURES = [
  {
    icon: PieChart,
    title: "Category exposure heatmap",
    desc: "How much of your portfolio is in Large Cap vs Flexi Cap vs Debt — visualised as a weighted pie.",
  },
  {
    icon: GitMerge,
    title: "Overlap analysis",
    desc: "Detect duplicate holdings across funds using the Jaccard similarity of their top-10 stock lists.",
  },
  {
    icon: Layers,
    title: "Portfolio diversification score",
    desc: "Correlation matrix of fund returns — lower avg correlation = higher diversification benefit.",
  },
  {
    icon: TrendingUp,
    title: "Weighted aggregate metrics",
    desc: "Blended CAGR, Sharpe, Max Drawdown, and QuantFund Score weighted by your allocation.",
  },
];

function Portfolio() {
  return (
    <AppShell title="Portfolio Analyzer">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-cyan" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Portfolio Analyzer</h1>
          <span className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Coming soon
          </span>
        </div>

        <div className="mb-6 rounded-sm border border-border bg-surface/60 p-4 text-sm text-muted-foreground">
          The Portfolio Analyzer will let you enter your fund holdings and allocation weights,
          then compute aggregate risk-return analytics from real NAV history.
          While this page is being built, analyse individual funds via the{" "}
          <Link to="/explorer" className="text-cyan underline underline-offset-2">Fund Explorer</Link>
          {" "}or compare leaders in each category on the{" "}
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
