import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/rankings")({
  head: () => ({ meta: [{ title: "Rankings — QuantFund" }] }),
  component: Rankings,
});

function Rankings() {
  return (
    <AppShell title="Rankings">
      <div className="glass flex items-start gap-3 rounded-2xl p-6">
        <Construction className="mt-0.5 h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-medium">Category-scoped rankings coming back online</div>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Per the audit, cross-category rankings are invalid. New leaderboards will be category-scoped and powered by the QuantFund Score. Tracking: <code>IMPLEMENTATION_GUIDE.md</code> step&nbsp;6.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
