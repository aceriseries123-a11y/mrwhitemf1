import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "Category-scoped mutual fund leaderboards powered by the QuantFund Score — no invalid cross-category comparisons." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:description", content: "Top Indian mutual funds ranked within each category by QuantFund Score." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
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
