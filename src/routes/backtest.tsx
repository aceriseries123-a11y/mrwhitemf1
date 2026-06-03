import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/backtest")({
  head: () => ({ meta: [{ title: "Backtesting — QuantFund" }] }),
  component: Backtest,
});

function Backtest() {
  return (
    <AppShell title="Backtesting">
      <div className="glass flex items-start gap-3 rounded-2xl p-6">
        <Construction className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-medium">Backtesting being rewired</div>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Portfolio backtests require NAV history fetchers wired to the new AMFI loader and benchmark TRI series (see <code>benchmarks.ts</code>).
          </p>
        </div>
      </div>
    </AppShell>
  );
}
