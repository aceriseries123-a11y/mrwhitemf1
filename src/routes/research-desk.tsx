/**
 * research-desk.tsx
 *
 * Clearly communicates:
 *   1. What will eventually live here (data-driven signals)
 *   2. That no signals are currently available
 *   3. What the user CAN rely on now (QuantFund Score, category rankings)
 *
 * DO NOT re-add any static insight strings.
 * DO NOT label any feature "AI" until a real model is in production.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, TrendingUp, ShieldCheck, BarChart3, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/research-desk")({
  head: () => ({
    meta: [
      { title: "Research Desk — QuantFund" },
      { name: "description", content: "Upcoming data-driven research signals: rolling momentum, drawdown alerts, and benchmark capture analytics for Indian mutual funds." },
      { property: "og:title", content: "Research Desk — QuantFund" },
      { property: "og:description", content: "Quant-driven mutual fund research signals, currently in development." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/research-desk" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/research-desk" }],
  }),
  component: ResearchDeskPage,
});

const PLANNED_SIGNALS = [
  {
    icon: TrendingUp,
    title: "Rolling Momentum Signals",
    description:
      "Funds showing sustained outperformance vs their category benchmark " +
      "over trailing 3-month and 6-month windows, recomputed weekly from NAV data.",
    status: "In development",
    statusTone: "cyan" as const,
  },
  {
    icon: ShieldCheck,
    title: "Drawdown Alerts",
    description:
      "Notification when a fund's current drawdown from its all-time high " +
      "exceeds historical norms for its category (e.g. > 1 standard deviation).",
    status: "Planned",
    statusTone: "muted" as const,
  },
  {
    icon: BarChart3,
    title: "Factor Exposure Analysis",
    description:
      "Rolling regression of fund returns against size, value, and momentum " +
      "factors to surface unintended style drift.",
    status: "Planned",
    statusTone: "muted" as const,
  },
];

function ResearchDeskPage() {
  return (
    <AppShell title="Research Desk">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-2 flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-cyan" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Research Desk</h1>
          <span className="rounded-sm border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-warning">
            Beta
          </span>
        </div>

        <p className="mb-8 text-sm text-muted-foreground">
          Quantitative signals derived from verified NAV and benchmark data.
          Currently under development — no signals are live yet.
        </p>

        {/* Status banner */}
        <div className="mb-8 rounded-sm border border-cyan/30 bg-cyan/[0.06] p-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold text-cyan">What's available now:</span>{" "}
            Accurate NAV data, category-scoped rankings, and QuantFund Scores are live in the{" "}
            <Link to="/dashboard" className="font-medium text-cyan underline underline-offset-2">
              Dashboard
            </Link>
            ,{" "}
            <Link to="/rankings" className="font-medium text-cyan underline underline-offset-2">
              Rankings
            </Link>
            , and{" "}
            <Link to="/explorer" className="font-medium text-cyan underline underline-offset-2">
              Fund Explorer
            </Link>
            . Research Desk signals will be added once the underlying models are validated
            against historical data.
          </p>
        </div>

        {/* Planned signals */}
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Planned signals
        </div>

        <div className="space-y-3">
          {PLANNED_SIGNALS.map((signal) => (
            <div
              key={signal.title}
              className="rounded-sm border border-border bg-surface p-5"
            >
              <div className="flex items-start gap-3">
                <signal.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {signal.title}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                      signal.statusTone === "cyan"
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : "border-border bg-background text-muted-foreground"
                    }`}>
                      <Clock className="h-2.5 w-2.5" />
                      {signal.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {signal.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Transparency note */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            QuantFund does not use AI or machine learning in its current scoring model. The{" "}
            <span className="text-foreground">QuantFund Score</span> is a transparent,
            rules-based composite of four quantitative metrics (CAGR, Sharpe, Max Drawdown,
            Rolling Return Consistency), computed from real AMFI NAV history and normalised
            within each fund category. See{" "}
            <Link to="/settings" className="text-cyan underline underline-offset-2">
              Settings → Methodology
            </Link>{" "}
            for full details.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
