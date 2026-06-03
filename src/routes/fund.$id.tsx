import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ArrowLeft } from "lucide-react";
import { useAMFISchemes } from "@/lib/live-data";
import { classifyAMFICategory } from "@/lib/categories";

export const Route = createFileRoute("/fund/$id")({
  head: ({ params }) => ({ meta: [{ title: `Scheme ${params.id} — Fund Details · QuantFund` }] }),
  component: FundPage,
});

function FundPage() {
  const { id } = Route.useParams();
  const { data: schemes, isLoading } = useAMFISchemes();
  const scheme = schemes?.find((s) => s.schemeCode === id);

  return (
    <AppShell title={scheme?.schemeName ?? `Scheme ${id}`}>
      <Link to="/explorer" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Explorer
      </Link>

      {isLoading && <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">Loading…</div>}

      {!isLoading && !scheme && (
        <div className="glass rounded-2xl p-6 text-sm">Scheme {id} not found in AMFI universe.</div>
      )}

      {scheme && (
        <div className="glass rounded-2xl p-6">
          <div className="text-xs text-muted-foreground">{scheme.amc}</div>
          <h1 className="mt-1 text-2xl font-semibold">{scheme.schemeName}</h1>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Field label="Category">{classifyAMFICategory(scheme.category)}</Field>
            <Field label="NAV">₹{scheme.nav.toFixed(4)}</Field>
            <Field label="NAV Date">{scheme.date}</Field>
            <Field label="Scheme Code">{scheme.schemeCode}</Field>
            <Field label="ISIN">{scheme.isin ?? "—"}</Field>
            <Field label="AMFI Category">{scheme.category}</Field>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            NAV history charts, QuantFund Score breakdown and benchmark comparison are being rewired against the new data layer. See <code>IMPLEMENTATION_GUIDE.md</code>.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{children}</div>
    </div>
  );
}
