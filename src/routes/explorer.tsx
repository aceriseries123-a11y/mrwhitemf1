import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Fund Explorer — QuantFund" },
      { name: "description", content: "Search and filter the full Indian mutual fund universe (4,000+ schemes) by AMC, category and NAV." },
      { property: "og:title", content: "Fund Explorer — QuantFund" },
      { property: "og:description", content: "Browse every active Indian mutual fund scheme with live AMFI NAV data." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/explorer" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/explorer" }],
  }),
  component: Explorer,
});

type SortField = "name" | "category" | "amc" | "nav";
type SortDir = "asc" | "desc";

function Explorer() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | QuantFundCategory>("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const view = useMemo(() => {
    if (!allSchemes) return [] as (AMFIScheme & { qfCategory: QuantFundCategory })[];
    const active = filterActiveSchemes(allSchemes).map((s) => ({
      ...s,
      qfCategory: classifyAMFICategory(s.category),
    }));
    const q = query.trim().toLowerCase();
    const filtered = active.filter((s) => {
      if (category !== "All" && s.qfCategory !== category) return false;
      if (q && !s.schemeName.toLowerCase().includes(q) && !s.schemeCode.includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const va: string | number =
        sortField === "name" ? a.schemeName
        : sortField === "category" ? a.qfCategory
        : sortField === "amc" ? a.amc
        : a.nav;
      const vb: string | number =
        sortField === "name" ? b.schemeName
        : sortField === "category" ? b.qfCategory
        : sortField === "amc" ? b.amc
        : b.nav;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [allSchemes, query, category, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("asc"); }
  };

  if (isLoading) {
    return (
      <AppShell title="Fund Explorer">
        <div className="glass flex items-center gap-3 rounded-2xl p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AMFI scheme universe…
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Fund Explorer">
        <div className="glass flex items-start gap-3 rounded-2xl border border-red-500/30 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
          <div>
            <div className="text-sm font-medium">AMFI data unavailable</div>
            <div className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Fund Explorer">
      <div className="glass mb-4 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scheme name or code"
              className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm outline-none focus:border-cyan"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as "All" | QuantFundCategory)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="All">All Categories</option>
            {QUANTFUND_CATEGORIES.filter((c) => c !== "Unknown").map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{view.length.toLocaleString()} schemes</span>
        </div>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th label="Scheme" field="name" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="Category" field="category" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="AMC" field="amc" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="NAV" field="nav" sortField={sortField} sortDir={sortDir} onClick={toggleSort} right />
            </tr>
          </thead>
          <tbody>
            {view.slice(0, 500).map((s) => (
              <tr key={s.schemeCode} className="border-b border-border/40 hover:bg-surface/40">
                <td className="px-3 py-2">
                  <Link to="/fund/$id" params={{ id: s.schemeCode }} className="text-cyan hover:underline">
                    {s.schemeName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{s.qfCategory}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.amc}</td>
                <td className="px-3 py-2 text-right font-mono">₹{s.nav.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.length > 500 && (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Showing first 500 of {view.length.toLocaleString()}. Refine with search or category to narrow.
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Returns, Sharpe, Sortino, AUM and QuantFund Score columns are temporarily hidden while the scoring engine is rewired against the new AMFI universe. See <code>IMPLEMENTATION_GUIDE.md</code>.
      </p>
    </AppShell>
  );
}

function Th({ label, field, sortField, sortDir, onClick, right }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onClick: (f: SortField) => void; right?: boolean;
}) {
  const active = sortField === field;
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} font-medium`}>
      <button onClick={() => onClick(field)} className={active ? "text-cyan" : ""}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
