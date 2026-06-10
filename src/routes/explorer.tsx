import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, X } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Fund Explorer — QuantFund" },
      { name: "description", content: "Search and filter the full Indian mutual fund universe (4,000+ schemes) by AMC, category and live AMFI NAV." },
      { property: "og:title", content: "Fund Explorer — QuantFund" },
      { property: "og:description", content: "Browse every active Indian mutual fund scheme with live AMFI NAV data." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/explorer" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/explorer" }],
  }),
  component: Explorer,
});

type Row = AMFIScheme & { qfCategory: QuantFundCategory };
type SortField = "name" | "category" | "amc" | "nav" | "date";
type SortDir = "asc" | "desc";

function Explorer() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | QuantFundCategory>("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const enriched: Row[] = useMemo(() => {
    if (!allSchemes) return [];
    return filterActiveSchemes(allSchemes).map((s) => ({
      ...s,
      qfCategory: classifyAMFICategory(s.category),
    }));
  }, [allSchemes]);

  const view = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
    const filtered = enriched.filter((s) => {
      if (category !== "All" && s.qfCategory !== category) return false;
      if (terms.length === 0) return true;
      const hay = `${s.schemeName} ${s.amc} ${s.schemeCode}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const va = pick(a, sortField);
      const vb = pick(b, sortField);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [enriched, query, category, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir(f === "nav" ? "desc" : "asc"); }
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
              placeholder="Search by scheme, AMC or code"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm outline-none focus:border-cyan"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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

      <div className="glass mb-3 rounded-2xl border border-cyan/20 bg-cyan/[0.04] px-4 py-2.5 text-xs text-muted-foreground">
        Showing verified AMFI fields only: scheme name, category, AMC and latest NAV.
        Risk-adjusted ratios (Sharpe, Sortino, drawdown, alpha) and trailing returns are
        computed per-fund from full NAV history on the{" "}
        <span className="text-cyan">Fund detail</span> page — click any scheme to open it.
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th label="Scheme" field="name" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="Category" field="category" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="AMC" field="amc" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
              <Th label="NAV ₹" field="nav" sortField={sortField} sortDir={sortDir} onClick={toggleSort} right />
              <Th label="As of" field="date" sortField={sortField} sortDir={sortDir} onClick={toggleSort} right />
            </tr>
          </thead>
          <tbody>
            {view.slice(0, 500).map((s) => (
              <tr key={s.schemeCode} className="border-b border-border/40 hover:bg-surface/40">
                <td className="px-3 py-2 max-w-[340px]">
                  <Link to="/fund/$id" params={{ id: s.schemeCode }} className="text-cyan hover:underline line-clamp-2">
                    {s.schemeName}
                  </Link>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">#{s.schemeCode}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{s.qfCategory}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{s.amc}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{s.nav.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">{s.date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.length > 500 && (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Showing first 500 of {view.length.toLocaleString()}. Refine with search or category to narrow.
          </div>
        )}
        {view.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No schemes match “{query}”. Try fewer words or clear the filter.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function pick(r: Row, f: SortField): number | string {
  switch (f) {
    case "name": return r.schemeName;
    case "category": return r.qfCategory;
    case "amc": return r.amc;
    case "nav": return r.nav;
    case "date": return r.date;
  }
}

function Th({ label, field, sortField, sortDir, onClick, right }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onClick: (f: SortField) => void; right?: boolean;
}) {
  const active = sortField === field;
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} font-medium whitespace-nowrap`}>
      <button onClick={() => onClick(field)} className={active ? "text-cyan" : "hover:text-foreground"}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
