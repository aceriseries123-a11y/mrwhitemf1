import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  Briefcase, PieChart, Layers, TrendingUp, GitMerge, ChevronRight, Plus,
} from "lucide-react";

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

const FEATURES = [
  {
    icon: PieChart,
    title: "Category exposure breakdown",
    desc: "How much of your portfolio sits in Large Cap vs Flexi Cap vs Debt — visualised as a weighted donut.",
    eta: "Q3 2025",
  },
  {
    icon: GitMerge,
    title: "Overlap analysis",
    desc: "Detect duplicate stock exposure across funds using top-10 holdings similarity (Jaccard coefficient).",
    eta: "Q4 2025",
  },
  {
    icon: Layers,
    title: "Diversification score",
    desc: "Pairwise return correlation matrix — lower average correlation = greater diversification benefit.",
    eta: "Q4 2025",
  },
  {
    icon: TrendingUp,
    title: "Weighted aggregate metrics",
    desc: "Blended CAGR, Sharpe, Max Drawdown, and QuantFund Score weighted by your allocation percentages.",
    eta: "Q1 2026",
  },
];

const MOCK_HOLDINGS = [
  { name: "Parag Parikh Flexi Cap Direct Growth", alloc: 40, cat: "Flexi Cap", score: 81.0 },
  { name: "Mirae Asset Large Cap Direct Growth", alloc: 30, cat: "Large Cap", score: 74.3 },
  { name: "Nippon India Small Cap Direct Growth", alloc: 20, cat: "Small Cap", score: 69.8 },
  { name: "HDFC Short Term Debt Direct Growth", alloc: 10, cat: "Short Duration", score: 62.1 },
];

function Portfolio() {
  return (
    <AppShell title="Portfolio Analyzer">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5">
            <Briefcase className="h-5 w-5 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Portfolio Analyzer</h1>
            <span className="rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              In Development
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Aggregate analytics across all your holdings · Weighted by allocation
          </p>
        </div>

        {/* Visual preview mockup */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Mock input area */}
          <div className="border-b border-border bg-background/60 px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-negative" />
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="h-2 w-2 rounded-full bg-positive" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">Portfolio Builder</span>
            </div>

            <div className="divide-y divide-border/60 rounded-xl border border-border bg-background/40">
              {MOCK_HOLDINGS.map((h, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i > 1 ? "blur-[2px] opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-foreground">{h.name}</p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h.cat}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center font-mono text-[11px] text-foreground">
                      {h.alloc}%
                    </div>
                    <div className="font-mono text-[11px] font-bold text-cyan">{h.score.toFixed(1)}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground opacity-40">
                <Plus className="h-4 w-4" />
                <span className="text-xs">Add fund…</span>
              </div>
            </div>
          </div>

          {/* Mock summary cards */}
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            {[
              { label: "Blended Score", value: "74.8", tone: "text-cyan" },
              { label: "Wtd. 3Y CAGR", value: "+18.2%", tone: "text-positive" },
              { label: "Wtd. Sharpe", value: "1.31", tone: "text-foreground" },
              { label: "Wtd. Max DD", value: "−24.1%", tone: "text-negative" },
            ].map((c) => (
              <div key={c.label} className="bg-surface/80 px-4 py-4 blur-sm">
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border bg-background/40 py-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Portfolio analytics · Coming soon
            </p>
          </div>
        </div>

        {/* What to do now */}
        <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] p-5">
          <p className="mb-3 text-sm font-medium text-foreground">Analyse your holdings individually right now</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Fund Explorer", to: "/explorer", desc: "Search any scheme" },
              { label: "Rankings", to: "/rankings", desc: "Category leaders" },
              { label: "Screener", to: "/screener", desc: "Filter by metrics" },
            ].map((item) => (
              <Link key={item.label} to={item.to}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:border-cyan/40">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* Planned features */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Planned features</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <f.icon className="h-4 w-4 shrink-0 text-cyan" />
                    <span className="text-sm font-semibold text-foreground">{f.title}</span>
                  </div>
                  <span className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                    {f.eta}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
