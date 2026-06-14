import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  History, LineChart, Calendar, TrendingUp, ShieldCheck, ChevronRight,
} from "lucide-react";

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

const FEATURES = [
  {
    icon: LineChart,
    title: "Lump-sum growth simulation",
    desc: "Starting capital grown at actual historical NAVs — exact rupee values, no index approximations.",
    eta: "Q3 2025",
  },
  {
    icon: Calendar,
    title: "SIP simulator",
    desc: "Monthly SIP at real NAV history. Shows total invested, corpus, XIRR, and unit accumulation over time.",
    eta: "Q3 2025",
  },
  {
    icon: TrendingUp,
    title: "Benchmark comparison",
    desc: "Fund growth vs category benchmark TRI (Nifty 100 for Large Cap, Midcap 150 for Mid Cap, etc.).",
    eta: "Q4 2025",
  },
  {
    icon: ShieldCheck,
    title: "Rolling period analysis",
    desc: "Distribution of 1Y, 3Y, 5Y returns across all historical start dates — reveals consistency, not just one lucky period.",
    eta: "Q4 2025",
  },
];

// Mock SIP simulation data for the visual preview
const MOCK_MONTHS = 36;
const mockSIP = Array.from({ length: MOCK_MONTHS }).map((_, i) => {
  const base = 10000 * (i + 1);
  const growth = base * (1 + (Math.sin(i * 0.3) * 0.05 + i * 0.008));
  return { invested: base, corpus: Math.round(growth) };
});
const finalInvested = mockSIP[MOCK_MONTHS - 1].invested;
const finalCorpus = mockSIP[MOCK_MONTHS - 1].corpus;
const gain = finalCorpus - finalInvested;
const gainPct = ((gain / finalInvested) * 100).toFixed(1);

function Backtest() {
  return (
    <AppShell title="Backtesting">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Backtesting</h1>
            <span className="rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              In Development
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Lump-sum & SIP simulation · Benchmark TRI comparison · Rolling analysis
          </p>
        </div>

        {/* Visual preview mockup */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Mock controls */}
          <div className="border-b border-border bg-background/60 px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-negative" />
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="h-2 w-2 rounded-full bg-positive" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">SIP Simulator</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Fund", value: "Mirae Asset Large Cap" },
                { label: "Monthly SIP", value: "₹10,000" },
                { label: "Start date", value: "Jan 2022" },
                { label: "End date", value: "Dec 2024" },
              ].map((f) => (
                <div key={f.label} className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mock chart */}
          <div className="relative h-44 overflow-hidden bg-background/30 px-5 pt-4">
            <div className="flex h-full items-end gap-0.5">
              {mockSIP.map((d, i) => {
                const maxCorpus = Math.max(...mockSIP.map((x) => x.corpus));
                const corpusH = (d.corpus / maxCorpus) * 100;
                const investedH = (d.invested / maxCorpus) * 100;
                return (
                  <div key={i} className="relative flex flex-1 flex-col items-stretch gap-0">
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-cyan/20"
                      style={{ height: `${corpusH}%` }} />
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-border/40"
                      style={{ height: `${investedH}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                SIP growth chart preview
              </p>
            </div>
          </div>

          {/* Mock summary */}
          <div className="grid grid-cols-3 gap-px bg-border">
            {[
              { label: "Total Invested", value: `₹${(finalInvested / 1000).toFixed(0)}K`, tone: "text-foreground" },
              { label: "Final Corpus", value: `₹${(finalCorpus / 1000).toFixed(0)}K`, tone: "text-positive" },
              { label: "Gain (XIRR)", value: `+${gainPct}%`, tone: "text-cyan" },
            ].map((c) => (
              <div key={c.label} className="bg-surface/80 px-4 py-4 blur-sm">
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={`mt-1.5 font-display text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-background/40 py-3 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Real NAV simulation · Coming soon
            </p>
          </div>
        </div>

        {/* What to do now */}
        <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] p-5">
          <p className="mb-3 text-sm font-medium text-foreground">
            Check trailing returns and NAV charts while this is being built
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Fund Explorer", to: "/explorer", desc: "NAV chart for any scheme" },
              { label: "Rankings", to: "/rankings", desc: "Top funds per category" },
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

        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Data: AMFI NAVAll (up to 20Y per fund) · Benchmark TRI: NSE / CRISIL indices (planned)
        </div>
      </div>
    </AppShell>
  );
}
