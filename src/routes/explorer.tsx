import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { Search, Download, ArrowUp, ArrowDown } from "lucide-react";
import {
  useAMFISchemes, useLazyMetrics, useAumMap, fmt, type Scheme, type FundGroup, type Metrics,
} from "@/lib/live-data";

export const Route = createFileRoute("/explorer")({
  head: () => ({ meta: [{ title: "Fund Explorer — QuantFund" }] }),
  component: Explorer,
});

const GROUP_LIST: ("All" | FundGroup)[] = ["All", "Equity", "Hybrid", "Debt", "Index", "Commodity", "International", "Solution", "Other"];

function scoreColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 75) return "text-positive";
  if (v >= 60) return "text-cyan";
  if (v >= 45) return "text-foreground";
  return "text-negative";
}
function retColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 12) return "text-positive";
  if (v >= 8) return "text-cyan";
  return "text-negative";
}
function ddColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= -10) return "text-positive";
  if (v >= -25) return "text-cyan";
  return "text-negative";
}

type SortField =
  | "name" | "bucket" | "aum" | "nav"
  | "r1Y" | "r3Y" | "r5Y" | "r7Y" | "r10Y"
  | "sharpe" | "sortino" | "alpha" | "beta" | "maxDrawdown" | "aiScore";
type SortDir = "asc" | "desc";

// Cache of metrics by scheme code, populated by row-level lazy loading.
// Lives at module scope so sort comparator can read it; updated by Row.
const _metricsByCode = new Map<string, Metrics>();

function fmtAum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  // v is in INR crore
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(2)}k Cr`;
  return `₹${v.toFixed(0)} Cr`;
}

function Explorer() {
  const { schemes, loading, error } = useAMFISchemes();
  const [visibleCodes, setVisibleCodes] = useState<string[]>([]);
  const aumMap = useAumMap(visibleCodes);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"All" | FundGroup>("All");
  const [bucket, setBucket] = useState("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  // bump to re-sort when metrics arrive
  const [, setTick] = useState(0);
  const bumpSort = () => setTick(t => t + 1);

  const buckets = useMemo(() => {
    if (!schemes) return ["All"];
    const set = new Set<string>();
    for (const s of schemes) if (group === "All" || s.group === group) set.add(s.bucket);
    return ["All", ...[...set].sort()];
  }, [schemes, group]);

  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir(f === "name" || f === "bucket" ? "asc" : "desc"); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    if (!schemes) return [];
    const ql = q.toLowerCase();
    const out = schemes.filter(s =>
      (group === "All" || s.group === group) &&
      (bucket === "All" || s.bucket === bucket) &&
      (!ql || s.schemeName.toLowerCase().includes(ql) || s.amc.toLowerCase().includes(ql) || s.schemeCode.includes(ql))
    );

    const dir = sortDir === "asc" ? 1 : -1;
    const numeric = (a: number | null | undefined, b: number | null | undefined) => {
      const av = a == null || isNaN(a) ? -Infinity : a;
      const bv = b == null || isNaN(b) ? -Infinity : b;
      return (av - bv) * dir;
    };
    const metric = (code: string, k: keyof Metrics) => {
      const m = _metricsByCode.get(code);
      return m ? (m[k] as number | null) : null;
    };

    out.sort((a, b) => {
      switch (sortField) {
        case "name": return a.schemeName.localeCompare(b.schemeName) * dir;
        case "bucket": return (a.bucket.localeCompare(b.bucket) || a.schemeName.localeCompare(b.schemeName)) * dir;
        case "aum": return numeric(aumMap[a.schemeCode], aumMap[b.schemeCode]);
        case "nav": return numeric(a.nav, b.nav);
        default: return numeric(metric(a.schemeCode, sortField), metric(b.schemeCode, sortField));
      }
    });
    return out;
  }, [schemes, q, group, bucket, sortField, sortDir, aumMap]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);

  // Sync visible scheme codes so AUM is fetched only for what's on screen.
  const viewCodesKey = view.map(s => s.schemeCode).join(",");
  useEffect(() => {
    setVisibleCodes(view.map(s => s.schemeCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCodesKey]);

  function downloadCsv() {
    const header = ["schemeCode","schemeName","amc","group","bucket","nav","navDate","aum_cr"].join(",");
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header, ...filtered.map(r => [r.schemeCode, r.schemeName, r.amc, r.group, r.bucket, r.nav, r.navDate, aumMap[r.schemeCode] ?? ""].map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `funds-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Fund Explorer">
      <div className="glass mb-4 flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Search scheme, AMC or AMFI code…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <select value={group} onChange={e => { setGroup(e.target.value as any); setBucket("All"); setPage(0); }}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
          {GROUP_LIST.map(g => <option key={g}>{g}</option>)}
        </select>
        <select value={bucket} onChange={e => { setBucket(e.target.value); setPage(0); }}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
          {buckets.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted">
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      {loading && <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading real AMFI scheme list (this happens once, cached 6h)…</div>}
      {error && <div className="glass rounded-2xl p-4 text-sm text-negative">Failed to load AMFI feed: {error}</div>}

      {schemes && (
      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-surface/90 text-muted-foreground backdrop-blur">
              <tr className="border-b border-border">
                <Th field="name" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Scheme</Th>
                <Th field="bucket" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Category</Th>
                <Th field="aum" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>AUM</Th>
                <Th field="nav" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>NAV</Th>
                <Th field="r1Y" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>1Y</Th>
                <Th field="r3Y" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>3Y</Th>
                <Th field="r5Y" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>5Y</Th>
                <Th field="r7Y" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>7Y</Th>
                <Th field="r10Y" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>10Y</Th>
                <Th field="sharpe" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Sharpe</Th>
                <Th field="sortino" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Sortino</Th>
                <Th field="alpha" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Alpha</Th>
                <Th field="beta" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Beta</Th>
                <Th field="maxDrawdown" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Max DD</Th>
                <Th field="aiScore" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>AI Score</Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {view.map(s => <Row key={s.schemeCode} s={s} aum={aumMap[s.schemeCode] ?? null} onMetrics={bumpSort} />)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{filtered.length.toLocaleString()} of {schemes.length.toLocaleString()} schemes · page {page + 1} / {pages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-md border border-border px-2 py-1 hover:bg-muted">Prev</button>
            <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} className="rounded-md border border-border px-2 py-1 hover:bg-muted">Next</button>
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          Source: AMFI India (NAV daily, AUM monthly) & MFAPI.in · Click any column header to sort. Metrics computed lazily from real NAV history.
        </div>
      </div>
      )}
    </AppShell>
  );
}

function Row({ s, aum, onMetrics }: { s: Scheme; aum: number | null; onMetrics: () => void }) {
  const { ref, metrics } = useLazyMetrics(s.schemeCode);
  const m: Partial<Metrics> = metrics ?? {};
  const ai = m.aiScore ?? null;
  // Publish metrics for sort comparator
  if (metrics && _metricsByCode.get(s.schemeCode) !== metrics) {
    _metricsByCode.set(s.schemeCode, metrics);
    // microtask schedule to avoid render churn
    queueMicrotask(onMetrics);
  }
  return (
    <tr ref={ref} className="border-b border-border/60 transition hover:bg-surface/60">
      <td className="px-3 py-2">
        <Link to="/fund/$id" params={{ id: s.schemeCode }} className="font-sans text-foreground hover:text-cyan">
          {s.schemeName}
        </Link>
        <div className="text-[10px] text-muted-foreground">{s.amc} · {s.schemeCode}</div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{s.bucket}</td>
      <td className="px-3 py-2">{fmtAum(aum)}</td>
      <td className="px-3 py-2">{s.nav.toFixed(2)}</td>
      <td className={"px-3 py-2 " + retColor(m.r1Y ?? null)}>{fmt.pct(m.r1Y, 2)}</td>
      <td className={"px-3 py-2 " + retColor(m.r3Y ?? null)}>{fmt.pct(m.r3Y, 2)}</td>
      <td className={"px-3 py-2 " + retColor(m.r5Y ?? null)}>{fmt.pct(m.r5Y, 2)}</td>
      <td className={"px-3 py-2 " + retColor(m.r7Y ?? null)}>{fmt.pct(m.r7Y, 2)}</td>
      <td className={"px-3 py-2 " + retColor(m.r10Y ?? null)}>{fmt.pct(m.r10Y, 2)}</td>
      <td className="px-3 py-2">{fmt.num(m.sharpe, 2)}</td>
      <td className="px-3 py-2">{fmt.num(m.sortino, 2)}</td>
      <td className="px-3 py-2">{fmt.num(m.alpha, 2)}</td>
      <td className="px-3 py-2">{fmt.num(m.beta, 2)}</td>
      <td className={"px-3 py-2 " + ddColor(m.maxDrawdown ?? null)}>{fmt.pct(m.maxDrawdown, 1)}</td>
      <td className={"px-3 py-2 font-semibold " + scoreColor(ai)}>{fmt.score(ai)}</td>
    </tr>
  );
}

function Th({
  children, field, sortField, sortDir, onClick,
}: {
  children: React.ReactNode;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onClick: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">
      <button
        type="button"
        onClick={() => onClick(field)}
        className={"inline-flex items-center gap-1 hover:text-foreground " + (active ? "text-cyan" : "")}
      >
        {children}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}
