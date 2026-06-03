import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio Analyzer — QuantFund" }] }),
  component: Portfolio,
});

function Portfolio() {
  return (
    <AppShell title="Portfolio Analyzer">
      <div className="glass flex items-start gap-3 rounded-2xl p-6">
        <Construction className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-medium">Portfolio Analyzer being rewired</div>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            The analyzer needs the new scoring engine and category-aware benchmarks before it can produce trustworthy aggregates.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
