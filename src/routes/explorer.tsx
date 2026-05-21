import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useMemo, useState } from "react";
import { Search, Download, ArrowUpDown } from "lucide-react";
import {
  useAMFISchemes, useLazyMetrics, fmt, type Scheme, type FundGroup, type Metrics,
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

function Explorer() {
  const { schemes, loading, error } = useAMFISchemes();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"All" | FundGroup>("All");
  const [bucket, setBucket] = useState("All");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // build bucket list filtered by group
  const buckets = useMemo(() => {
    if (!schemes) return ["All"];
    const set = new Set<string>();
    for (const s of schemes) if (group === "All" || s.group === group) set.add(s.bucket);
    return ["All", ...[...set].sort()];
  }, [schemes, group]);

  const filtered = useMemo(() => {
    if (!schemes) return [];
    const ql = q.toLowerCase();
    return schemes.filter(s =>
      (group === "All" || s.group === group) &&
      (bucket === "All" || s.bucket === bucket) &&
      (!ql || s.schemeName.toLowerCase().includes(ql) || s.amc.toLowerCase().includes(ql) || s.schemeCode.includes(ql))
    );
  }, [schemes, q, group, bucket]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function downloadCsv() {
    const header = ["schemeCode","schemeName","amc","group","bucket","nav","navDate"].join(",");
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header, ...filtered.map(r => [r.schemeCode, r.schemeName, r.amc, r.group, r.bucket, r.nav, r.navDate].map(esc).join(","))].join("\n");
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
                <Th>Scheme</Th>
                <Th>Category</Th>
                <Th>NAV</Th>
                <Th>1Y</Th>
                <Th>3Y</Th>
                <Th>5Y</Th>
                <Th>7Y</Th>
                <Th>10Y</Th>
                <Th>Sharpe</Th>
                <Th>Sortino</Th>
                <Th>Alpha</Th>
                <Th>Beta</Th>
                <Th>Max DD</Th>
                <Th>AI Score</Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {view.map(s => <Row key={s.schemeCode} s={s} />)}
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
          Source: AMFI India & MFAPI.in · Metrics computed lazily from real NAV history.
        </div>
      </div>
      )}
    </AppShell>
  );
}

function Row({ s }: { s: Scheme }) {
  const { ref, metrics } = useLazyMetrics(s.schemeCode);
  const m: Partial<Metrics> = metrics ?? {};
  const ai = m.aiScore ?? null;
  return (
    <tr ref={ref} className="border-b border-border/60 transition hover:bg-surface/60">
      <td className="px-3 py-2">
        <Link to="/fund/$id" params={{ id: s.schemeCode }} className="font-sans text-foreground hover:text-cyan">
          {s.schemeName}
        </Link>
        <div className="text-[10px] text-muted-foreground">{s.amc} · {s.schemeCode}</div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{s.bucket}</td>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"><span className="inline-flex items-center gap-1">{children}</span></th>;
}
