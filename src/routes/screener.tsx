import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/screener")({
  head: () => ({ meta: [{ title: "Screener — QuantFund" }] }),
  component: Screener,
});

function Screener() {
  return (
    <AppShell title="Screener">
      <div className="glass flex items-start gap-3 rounded-2xl p-6">
        <Construction className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-medium">Screener being rewired</div>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            The metric filters (Sharpe, CAGR, max drawdown, QuantFund Score) need the new scoring engine to produce per-scheme metrics across the full AMFI universe before this page can be re-enabled.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
