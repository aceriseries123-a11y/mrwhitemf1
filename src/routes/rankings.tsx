/**
 * rankings.tsx — Global fund rankings from Dashboard's pre-computed data.
 *
 * Reads directly from fund-store (populated by Dashboard as it loads NAV series
 * and computes Advanced Score for every Direct-Growth fund).
 * No independent NAV fetching, no loading spinner — instant if Dashboard ran.
 * Single unified score: 6-factor Advanced Score (same as Dashboard Table 1).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trophy, Search, X } from "lucide-react";
import { fmtPct, fmtNum } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { getFullRankedList, type RankedFund } from "@/lib/fund-store";
import { QUANTFUND_CATEGORIES, type QuantFundCategory } from "@/lib/categories";

export const Route = createFileRoute("/rankings")({
  head: () => ({
    meta: [
      { title: "Rankings — QuantFund" },
      { name: "description", content: "All Direct-Growth mutual funds ranked by the QuantFund Advanced Score — 6-factor, percentile-normalised across the full AMFI universe." },
      { property: "og:title", content: "Rankings — QuantFund" },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/rankings" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/rankings" }],
  }),
  component: Rankings,
});

const ALL_CATEGORIES = QUANTFUND_CATEGORIES.filter((c) => c !== "Unknown") as QuantFundCategory[];

type SortKey = "advScore" | "ret1y" | "cagr3y" | "sharpe" | "maxDD";

function tone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-negative";
}

function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-cyan transition-all duration-500"
        style={{ width: value != null ? `${Math.min(100, Math.max(0, value))}%` : "0%" }}
      />
    </div>
  );
}

function Rankings() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<QuantFundCategory | "All">("All");
  const [sortKey, setSortKey] = useState<SortKey>("advScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Read directly from fund-store — populated by Dashboard, instant on mount
  const allRanked = getFullRankedList();
  const hasData = allRanked.length > 0;

  // Precompute global rank map so the table render is O(1) per row
  const globalRankMap = useMemo(() => {
    const map = new Map<string, number>();
    allRanked.forEach((f, i) => map.set(f.schemeCode, i + 1));
    return map;
  }, [allRanked]);

  // Categories that actually have funds in the store
  const availableCategories = useMemo(() => {
    const cats = new Set(allRanked.map((f) => f.poolCategory));
    return ALL_CATEGORIES.filter((c) => cats.has(c));
  }, [allRanked]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = allRanked;

    if (selectedCat !== "All") {
      list = list.filter((f) => f.poolCategory === selectedCat);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.schemeName.toLowerCase().includes(q) ||
          f.amc.toLowerCase().includes(q) ||
          f.poolCategory.toLowerCase().includes(q),
      );
    }

    const dir = sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      const va =
        sortKey === "advScore" ? a.advScore
        : sortKey === "ret1y"  ? a.metrics.ret1y
        : sortKey === "cagr3y" ? a.metrics.cagr3y
        : sortKey === "sharpe" ? a.metrics.sharpe
        : a.metrics.maxDrawdown;
      const vb =
        sortKey === "advScore" ? b.advScore
        : sortKey === "ret1y"  ? b.metrics.ret1y
        : sortKey === "cagr3y" ? b.metrics.cagr3y
        : sortKey === "sharpe" ? b.metrics.sharpe
        : b.metrics.maxDrawdown;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
  }, [allRanked, selectedCat, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        className="cursor-pointer select-none p-3 text-right font-medium transition-colors hover:text-foreground"
        onClick={() => toggleSort(k)}
      >
        {label}
        {sortKey === k && (
          <span className="ml-1 text-cyan">{sortDir === "desc" ? "↓" : "↑"}</span>
        )}
      </th>
    );
  }

  // ── No-data state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <AppShell title="Rankings">
        <div className="mx-auto max-w-xl py-24 text-center">
          <Trophy className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
          <h2 className="font-display text-lg font-bold text-foreground">Fund data not loaded yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Rankings reads from Dashboard. Visit Dashboard first — it downloads and scores all funds.
            Once done, Rankings is instant every time.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-opacity hover:opacity-90"
          >
            Load data on Dashboard →
          </Link>
        </div>
      </AppShell>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Rankings">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Global Rankings</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {allRanked.length.toLocaleString()} Direct-Growth funds · Advanced Score
            </p>
          </div>
          <DataSourceBadge />
        </div>

        {/* Score definition strip */}
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-bold text-cyan">Advanced Score</span> — cross-category, percentile-normalised within the full universe:
            Sharpe <span className="text-foreground">28%</span> ·
            Sortino <span className="text-foreground">22%</span> ·
            Calmar <span className="text-foreground">20%</span> ·
            3Y CAGR <span className="text-foreground">15%</span> ·
            Rolling+ <span className="text-foreground">10%</span> ·
            MaxDD <span className="text-foreground">5%</span>
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fund or AMC…"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-8 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-cyan/60 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setSelectedCat("All")}
              className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
                selectedCat === "All"
                  ? "bg-cyan text-background shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                  : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
              }`}
            >
              All ({allRanked.length})
            </button>
            {availableCategories.map((cat) => {
              const count = allRanked.filter((f) => f.poolCategory === cat).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
                    selectedCat === cat
                      ? "bg-cyan text-background shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                      : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                  }`}
                >
                  {cat} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-border bg-background/95 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <th className="p-3 font-medium">#</th>
                  <th className="p-3 font-medium">Fund</th>
                  <SortTh label="Adv. Score" k="advScore" />
                  <SortTh label="1Y Ret" k="ret1y" />
                  <SortTh label="3Y CAGR" k="cagr3y" />
                  <SortTh label="Sharpe" k="sharpe" />
                  <SortTh label="Max DD" k="maxDD" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayed.map((fund, catIdx) => {
                  const globalRank = globalRankMap.get(fund.schemeCode) ?? catIdx + 1;
                  const isTop3 = globalRank <= 3;
                  return (
                    <tr
                      key={fund.schemeCode}
                      className={`transition-colors hover:bg-cyan/[0.05] ${isTop3 ? "bg-cyan/[0.025]" : ""}`}
                    >
                      {/* Rank */}
                      <td className="p-3 font-mono text-[11px] tabular-nums">
                        <div className="flex flex-col items-start">
                          <span className={`font-bold ${isTop3 ? "text-cyan" : "text-muted-foreground"}`}>
                            {isTop3 ? ["🥇", "🥈", "🥉"][globalRank - 1] : `#${globalRank}`}
                          </span>
                          {selectedCat !== "All" && catIdx + 1 !== globalRank && (
                            <span className="mt-0.5 font-mono text-[8px] text-muted-foreground opacity-40">
                              #{catIdx + 1} cat
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fund name */}
                      <td className="p-3">
                        <div className="flex max-w-[300px] flex-col gap-0.5">
                          <Link
                            to="/fund/$id"
                            params={{ id: fund.schemeCode }}
                            className="text-[12px] font-semibold leading-snug text-foreground transition-colors hover:text-cyan"
                          >
                            {fund.schemeName}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="font-mono text-[9px] text-muted-foreground">
                              {fund.amc} · ₹{fund.nav.toFixed(2)}
                            </span>
                            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
                              {fund.poolCategory}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Advanced Score */}
                      <td className="p-3 text-right">
                        {fund.advScore != null ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="font-mono text-[12px] font-bold tabular-nums text-cyan">
                              {fmtNum(fund.advScore, 1)}
                            </span>
                            <ScoreBar value={fund.advScore} />
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* 1Y Return */}
                      <td className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${tone(fund.metrics.ret1y)}`}>
                        {fmtPct(fund.metrics.ret1y, { signed: true })}
                      </td>

                      {/* 3Y CAGR */}
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(fund.metrics.cagr3y)}`}>
                        {fmtPct(fund.metrics.cagr3y, { signed: true })}
                      </td>

                      {/* Sharpe */}
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(fund.metrics.sharpe)}`}>
                        {fmtNum(fund.metrics.sharpe, 2)}
                      </td>

                      {/* Max DD */}
                      <td className={`p-3 text-right font-mono text-[11px] tabular-nums ${tone(fund.metrics.maxDrawdown)}`}>
                        {fmtPct(fund.metrics.maxDrawdown, { signed: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {displayed.length.toLocaleString()} funds shown
              {selectedCat !== "All" && ` · ${selectedCat}`}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {allRanked.length.toLocaleString()} total Direct-Growth funds · from Dashboard
            </span>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
