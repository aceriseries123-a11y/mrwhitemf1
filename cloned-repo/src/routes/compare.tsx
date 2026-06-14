import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  GitCompare, BarChart3, TrendingUp, ShieldCheck, Target,
  ChevronRight, Search,
} from "lucide-react";

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

const FEATURES = [
  {
    icon: BarChart3,
    title: "Side-by-side NAV chart",
    desc: "Indexed NAV from a common start date, any time window up to fund inception.",
    eta: "Q3 2025",
  },
  {
    icon: TrendingUp,
    title: "Metric comparison table",
    desc: "1Y, 3Y, 5Y CAGR · Sharpe · Sortino · Max Drawdown · QuantFund Score — all in one row per fund.",
    eta: "Q3 2025",
  },
  {
    icon: ShieldCheck,
    title: "Rolling return heatmaps",
    desc: "Monthly return heatmaps for up to 4 funds side-by-side to reveal consistency patterns.",
    eta: "Q4 2025",
  },
  {
    icon: Target,
    title: "Risk-return scatter",
    desc: "Annualised return vs annualised volatility plot with category peers as context.",
    eta: "Q4 2025",
  },
];

function Compare() {
  return (
    <AppShell title="Fund Compare">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5">
            <GitCompare className="h-5 w-5 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Fund Compare</h1>
            <span className="rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              In Development
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Head-to-head comparison of up to 4 funds using real NAV history
          </p>
        </div>

        {/* Visual preview mockup */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Mock header */}
          <div className="border-b border-border bg-background/60 px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-negative" />
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="h-2 w-2 rounded-full bg-positive" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">Compare — up to 4 funds</span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {["Fund A", "Fund B", "Fund C", "Fund D"].map((f, i) => (
                <div key={f}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    i < 2
                      ? "border-cyan/30 bg-cyan/[0.05] text-muted-foreground"
                      : "border-dashed border-border text-muted-foreground/40"
                  }`}>
                  {i < 2 ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-cyan opacity-60" />
                      <span className="truncate font-mono text-[10px]">
                        {i === 0 ? "HDFC Flexi Cap" : "Parag Parikh Flexi"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3 w-3" />
                      <span className="font-mono text-[10px]">Add fund…</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Mock chart area */}
          <div className="relative h-40 overflow-hidden bg-background/30">
            <div className="absolute inset-0 flex items-end px-6 pb-4">
              {Array.from({ length: 48 }).map((_, i) => {
                const h1 = 40 + Math.sin(i * 0.3) * 25 + i * 0.6;
                const h2 = 35 + Math.cos(i * 0.25) * 20 + i * 0.5;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                    <div className="w-full rounded-sm bg-cyan/20" style={{ height: `${Math.min(100, h1)}%` }} />
                    <div className="w-full rounded-sm bg-primary/20" style={{ height: `${Math.min(100, h2)}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="text-center">
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">NAV chart preview</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground opacity-60">Coming soon</p>
              </div>
            </div>
          </div>

          {/* Mock metric rows */}
          <div className="border-t border-border">
            {[
              { label: "3Y CAGR", v1: "+18.4%", v2: "+22.1%", tone1: "text-positive", tone2: "text-positive" },
              { label: "Sharpe Ratio", v1: "1.24", v2: "1.58", tone1: "", tone2: "text-cyan" },
              { label: "Max Drawdown", v1: "−28.3%", v2: "−19.7%", tone1: "text-negative", tone2: "text-positive" },
              { label: "QF Score", v1: "72.4", v2: "81.0", tone1: "", tone2: "text-cyan" },
            ].map((row) => (
              <div key={row.label}
                className="flex items-center gap-3 border-b border-border/40 px-5 py-2.5 last:border-b-0">
                <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {row.label}
                </span>
                <span className={`flex-1 text-center font-mono text-[11px] font-bold tabular-nums blur-sm ${row.tone1 || "text-foreground"}`}>
                  {row.v1}
                </span>
                <span className={`flex-1 text-center font-mono text-[11px] font-bold tabular-nums blur-sm ${row.tone2 || "text-foreground"}`}>
                  {row.v2}
                </span>
                <span className="flex-1 text-center font-mono text-[10px] text-muted-foreground blur-sm opacity-40">—</span>
                <span className="flex-1 text-center font-mono text-[10px] text-muted-foreground blur-sm opacity-40">—</span>
              </div>
            ))}
          </div>
        </div>

        {/* What you can do now */}
        <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] p-5">
          <p className="mb-3 text-sm font-medium text-foreground">What you can do right now</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "View fund details", to: "/explorer", desc: "Full metrics for any scheme" },
              { label: "Category rankings", to: "/rankings", desc: "Leaders in each category" },
              { label: "Screen funds", to: "/screener", desc: "Filter by Sharpe, CAGR, drawdown" },
            ].map((item) => (
              <Link key={item.label} to={item.to}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:border-cyan/40 hover:text-foreground">
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
