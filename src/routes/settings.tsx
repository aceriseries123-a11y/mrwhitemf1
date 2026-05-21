import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — QuantFund" }] }),
  component: Settings,
});

function Settings() {
  return (
    <AppShell title="Settings">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Preferences">
          <Row label="Default benchmark" value="Nifty 500 TRI" />
          <Row label="Rolling window" value="36 months" />
          <Row label="Risk-free rate" value="6.94%" />
          <Row label="Currency" value="INR (₹)" />
        </Section>
        <Section title="Data & sync">
          <Row label="NAV sync" value="Daily · 22:30 IST" />
          <Row label="Universe" value="4,128 schemes (AMFI · MFAPI · NSE)" />
          <Row label="Historical depth" value="20Y" />
          <Row label="Last sync" value={new Date().toLocaleString()} />
        </Section>
        <Section title="AI engine">
          <Row label="Model" value="QF-Composite v3.2" />
          <Row label="Factors" value="9 institutional factors" />
          <Row label="Refresh" value="Nightly" />
        </Section>
        <Section title="Account">
          <Row label="Plan" value="Professional" />
          <Row label="Exports" value="CSV · Excel · PDF" />
          <Row label="API access" value="Enabled" />
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
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
