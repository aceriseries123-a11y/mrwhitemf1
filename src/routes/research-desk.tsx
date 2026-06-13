import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FlaskConical, TrendingUp, ShieldCheck, BarChart3, Clock, ChevronRight,
} from "lucide-react";
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
    eta: "Q3 2025",
  },
  {
    icon: ShieldCheck,
    title: "Drawdown Alerts",
    description:
      "Notification when a fund's current drawdown from its all-time high " +
      "exceeds historical norms for its category (e.g. > 1 standard deviation).",
    status: "Planned",
    statusTone: "muted" as const,
    eta: "Q4 2025",
  },
  {
    icon: BarChart3,
    title: "Factor Exposure Analysis",
    description:
      "Rolling regression of fund returns against size, value, and momentum " +
      "factors to surface unintended style drift over time.",
    status: "Planned",
    statusTone: "muted" as const,
    eta: "Q1 2026",
  },
];

// Mock signal rows for the visual preview
const MOCK_SIGNALS = [
  { name: "Mirae Asset Large Cap Direct", signal: "Momentum ↑", score: 81.0, tone: "text-positive" },
  { name: "Parag Parikh Flexi Cap Direct", signal: "Momentum ↑", score: 79.4, tone: "text-positive" },
  { name: "HDFC Mid Cap Opp. Direct", signal: "Drawdown watch", score: 65.2, tone: "text-warning" },
  { name: "SBI Small Cap Direct", signal: "Drawdown watch", score: 61.8, tone: "text-warning" },
];

function ResearchDeskPage() {
  return (
    <AppShell title="Research Desk">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5">
            <FlaskConical className="h-5 w-5 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Research Desk</h1>
            <span className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-warning">
              Beta
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Quantitative signals derived from verified NAV and benchmark data
          </p>
        </div>

        {/* Status banner */}
        <div className="rounded-xl border border-cyan/25 bg-cyan/[0.05] p-5">
          <p className="text-sm text-foreground">
            <span className="font-semibold text-cyan">What's live right now:</span>{" "}
            Accurate NAV data, category-scoped rankings, and QuantFund Scores are already available in the{" "}
            <Link to="/dashboard" className="font-medium text-cyan underline underline-offset-2">Dashboard</Link>
            ,{" "}
            <Link to="/rankings" className="font-medium text-cyan underline underline-offset-2">Rankings</Link>
            , and{" "}
            <Link to="/explorer" className="font-medium text-cyan underline underline-offset-2">Fund Explorer</Link>.{" "}
            Research signals will be published once models are validated against historical data.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Rankings", to: "/rankings" },
              { label: "Screener", to: "/screener" },
            ].map((item) => (
              <Link key={item.label} to={item.to}
                className="flex items-center gap-1.5 rounded-lg border border-cyan/20 bg-cyan/[0.08] px-3 py-1.5 text-xs font-medium text-cyan transition-colors hover:bg-cyan/[0.12]">
                {item.label} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>

        {/* Signal preview mockup */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border bg-background/60 px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-negative" />
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="h-2 w-2 rounded-full bg-positive" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">Research Signals — preview</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-cyan/30 bg-cyan/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan">
                Momentum
              </span>
              <span className="rounded-lg border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Drawdown
              </span>
              <span className="rounded-lg border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground opacity-40">
                Factor
              </span>
            </div>
          </div>

          <div className="divide-y divide-border/60">
            {MOCK_SIGNALS.map((s, i) => (
              <div key={i}
                className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${i > 1 ? "opacity-50 blur-[1px]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Large Cap · Direct · Growth</p>
                </div>
                <span className={`shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider ${s.tone}`}>
                  {s.signal}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-cyan">{s.score.toFixed(1)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-background/40 py-3 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Live signals · Coming soon
            </p>
          </div>
        </div>

        {/* Planned signals */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Planned signals</p>
          <div className="space-y-3">
            {PLANNED_SIGNALS.map((signal) => (
              <div key={signal.title} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start gap-3">
                  <signal.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{signal.title}</span>
                      <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                        signal.statusTone === "cyan"
                          ? "border-cyan/40 bg-cyan/10 text-cyan"
                          : "border-border bg-background text-muted-foreground"
                      }`}>
                        <Clock className="h-2.5 w-2.5" />
                        {signal.status}
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-muted-foreground">{signal.eta}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{signal.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transparency */}
        <div className="border-t border-border pt-5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            QuantFund does not use AI or machine learning in its current scoring model. The{" "}
            <span className="text-foreground">QuantFund Score</span> is a transparent, rules-based composite
            of four quantitative metrics (CAGR, Sharpe, Max Drawdown, Rolling Return Consistency),
            computed from real AMFI NAV history and normalised within each fund category. See{" "}
            <Link to="/settings" className="text-cyan underline underline-offset-2">Settings → Methodology</Link>{" "}
            for full details.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
