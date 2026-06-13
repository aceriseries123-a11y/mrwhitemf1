import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, X, DatabaseZap } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory, QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Fund Explorer — QuantFund" },
      { name: "description", content: "Search and filter the full Indian mutual fund universe by AMC, category and live AMFI NAV." },
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

const PAGE_SIZE = 100;

function Explorer() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | QuantFundCategory>("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const enriched: Row[] = useMemo(() => {
    if (!allSchemes) return [];
    return filterActiveSchemes(allSchemes).map((s) => ({
      ...s,
      qfCategory: classifyAMFICategory(s.category),
    }));
  }, [allSchemes]);

  const view = useMemo(() => {
    setPage(1);
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

  const totalPages = Math.ceil(view.length / PAGE_SIZE);
  const pageRows = view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir(f === "nav" ? "desc" : "asc"); }
  };

  if (isLoading) {
    return (
      <AppShell title="Fund Explorer">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">Loading AMFI scheme universe…</p>
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Fund Explorer">
        <div className="flex items-start gap-4 rounded-xl border border-negative/40 bg-negative/10 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <div>
            <p className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">AMFI data unavailable</p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Fund Explorer">
      <div className="mx-auto max-w-6xl space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Fund Explorer</h1>
            <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {enriched.length.toLocaleString()} active open-ended schemes · Live AMFI NAV
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {view.length.toLocaleString()} matching
          </span>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by scheme, AMC or code…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-9 py-2 text-sm outline-none transition-colors focus:border-cyan focus:ring-1 focus:ring-cyan/20"
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
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-cyan"
          >
            <option value="All">All Categories</option>
            {QUANTFUND_CATEGORIES.filter((c) => c !== "Unknown").map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-2 rounded-xl border border-cyan/20 bg-cyan/[0.04] px-4 py-2.5 text-xs text-muted-foreground">
          <DatabaseZap className="h-3.5 w-3.5 shrink-0 text-cyan" />
          Showing verified AMFI fields: scheme name, category, AMC and latest NAV.
          Full risk metrics (Sharpe, Sortino, drawdown, CAGR) are computed from NAV history —
          click any scheme to open the <span className="text-cyan">Fund Detail</span> page.
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background/80 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <Th label="Scheme" field="name" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="Category" field="category" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="AMC" field="amc" sortField={sortField} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="NAV ₹" field="nav" sortField={sortField} sortDir={sortDir} onClick={toggleSort} right />
                  <Th label="As of" field="date" sortField={sortField} sortDir={sortDir} onClick={toggleSort} right />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState query={query} category={category} onClear={() => { setQuery(""); setCategory("All"); }} />
                    </td>
                  </tr>
                ) : (
                  pageRows.map((s) => (
                    <tr key={s.schemeCode} className="group transition-colors hover:bg-cyan/[0.04]">
                      <td className="px-4 py-2.5 max-w-[320px]">
                        <Link to="/fund/$id" params={{ id: s.schemeCode }}
                          className="font-medium text-foreground transition-colors hover:text-cyan line-clamp-2">
                          {s.schemeName}
                        </Link>
                        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">#{s.schemeCode}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-muted-foreground">{s.qfCategory}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-muted-foreground">{s.amc}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm">{s.nav.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {s.date || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Page {page} of {totalPages} · {view.length.toLocaleString()} schemes
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground disabled:opacity-40 hover:text-foreground">
                  ← Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground disabled:opacity-40 hover:text-foreground">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState({ query, category, onClear }: { query: string; category: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No schemes match your filters</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {query && <span>Search: "<span className="text-foreground">{query}</span>"</span>}
          {query && category !== "All" && " · "}
          {category !== "All" && <span>Category: <span className="text-foreground">{category}</span></span>}
        </p>
      </div>
      <button onClick={onClear}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-cyan/40 hover:text-foreground">
        Clear all filters
      </button>
    </div>
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
    <th className={`px-4 py-3 ${right ? "text-right" : "text-left"} font-medium whitespace-nowrap`}>
      <button onClick={() => onClick(field)}
        className={`transition-colors ${active ? "text-cyan" : "hover:text-foreground"}`}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
