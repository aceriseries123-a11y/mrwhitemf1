import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/compare")({
  head: () => ({ meta: [{ title: "Fund Compare — QuantFund" }] }),
  component: Compare,
});

function Compare() {
  return (
    <AppShell title="Fund Compare">
      <div className="glass flex items-start gap-3 rounded-2xl p-6">
        <Construction className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-medium">Being rewired to the new data layer</div>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Fund Compare depended on the previous curated-funds API. It will return once the scoring engine and NAV-history fetchers are reconnected to the full AMFI universe and the QuantFund Score (see <code>scoring.ts</code>) is computed per category.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
