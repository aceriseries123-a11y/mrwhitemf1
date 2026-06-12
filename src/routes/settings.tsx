import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAMFISchemes, filterActiveSchemes } from "@/lib/live-data";
import { RISK_FREE_RATE_LABEL } from "@/lib/risk-free-rate";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — QuantFund" },
      { name: "description", content: "Methodology, data sources, and rate assumptions used by QuantFund." },
      { property: "og:title", content: "Settings — QuantFund" },
      { property: "og:description", content: "Methodology and data sources for the QuantFund terminal." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/settings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/settings" }],
  }),
  component: Settings,
});

function Settings() {
  const { data: schemes } = useAMFISchemes();
  const universe = schemes ? filterActiveSchemes(schemes).length : null;
  const asOf = schemes?.[0]?.date ?? "—";

  return (
    <AppShell title="Settings">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Methodology defaults">
          <Row label="Default benchmark" value="Nifty 500 TRI (planned)" />
          <Row label="Rolling window" value="252 trading days (1Y)" />
          <Row label="Risk-free rate" value={RISK_FREE_RATE_LABEL} />
          <Row label="Currency" value="INR (₹)" />
        </Section>
        <Section title="Data sources">
          <Row label="Scheme universe" value="AMFI NAVAll (live)" />
          <Row label="Open-ended schemes" value={universe != null ? universe.toLocaleString() : "Loading…"} />
          <Row label="NAV history" value="mfapi.in (community mirror of AMFI)" />
          <Row label="Latest NAV date" value={asOf} />
          <Row label="Market indices" value="Not wired — awaiting API key" />
        </Section>
        <Section title="QuantFund Score">
          <Row label="Type" value="Transparent composite (not AI)" />
          <Row label="Factors" value="CAGR3Y · Sharpe · MaxDD · 1Y rolling positive %" />
          <Row label="Weights" value="35 / 25 / 20 / 20" />
          <Row label="Normalised" value="No — raw composite, comparable within category" />
        </Section>
        <Section title="Not available">
          <Row label="AUM" value="Not in AMFI feed" />
          <Row label="Expense ratio" value="Not in AMFI feed" />
          <Row label="Holdings / sector" value="Not in AMFI feed" />
          <Row label="Real-time intraday NAV" value="AMFI publishes EOD only" />
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono">{value}</span>
    </div>
  );
}
