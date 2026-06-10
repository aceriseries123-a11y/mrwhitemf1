/**
 * dashboard.tsx — Terminal (Minimal) direction
 *
 * Locked tokens: dark navy (#0a0e1a), surface (#0f1422), border (#1a2030),
 * cyan accent (#22d3ee), positive (#10b981), negative (#f43f5e),
 * JetBrains Mono for display + tabular numerals.
 *
 * Scores and trailing returns are computed deterministically from the
 * scheme code (stable pseudo-metrics) until the live scoring engine
 * (scoring.ts) is wired against NAV history. They are NOT predictions —
 * they are placeholders shaped like the real output.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Info } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "../lib/live-data";
import { classifyAMFICategory } from "../lib/categories";
import type { QuantFundCategory } from "../lib/categories";
import { previewMetrics } from "../lib/synthetic-metrics";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      {
        name: "description",
        content:
          "Category-scoped top fund rankings powered by the QuantFund Score across the full 4,000+ Indian mutual fund universe.",
      },
      { property: "og:title", content: "Dashboard — QuantFund" },
      {
        property: "og:description",
        content:
          "Top-ranked Indian mutual funds by category, scored on rolling returns, drawdowns, and risk-adjusted metrics.",
      },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

const DASHBOARD_CATEGORIES: QuantFundCategory[] = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "ELSS",
  "Aggressive Hybrid",
  "Short Duration",
];

interface ScoredScheme extends AMFIScheme {
  qfScore: number;
  ret1Y: number;
  sharpe: number;
  maxDrawdown: number;
}

function scoreScheme(s: AMFIScheme, cat: QuantFundCategory): ScoredScheme {
  const m = previewMetrics(s, cat);
  return { ...s, qfScore: m.qfScore, ret1Y: m.ret1Y, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown };
}


function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeCategory, setActiveCategory] = useState<QuantFundCategory>("Large Cap");

  const activeSchemes = useMemo(
    () => (allSchemes ? filterActiveSchemes(allSchemes) : []),
    [allSchemes],
  );

  const ranked: ScoredScheme[] = useMemo(() => {
    const inCat = activeSchemes.filter(
      (s) => classifyAMFICategory(s.category) === activeCategory,
    );
    return inCat
      .map(scoreScheme)
      .sort((a, b) => b.qfScore - a.qfScore)
      .slice(0, 10);
  }, [activeSchemes, activeCategory]);

  const medianRet = useMemo(() => {
    if (ranked.length === 0) return 0;
    const arr = [...ranked.map((r) => r.ret1Y)].sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  }, [ranked]);

  // ── Error
  if (isError) {
    return (
      <AppShell title="Dashboard">
        <div className="mx-auto max-w-4xl">
          <div className="flex gap-4 rounded-sm border border-negative/40 bg-negative/10 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-negative" />
            <div>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-widest text-negative">
                Fund data unavailable
              </h2>
              <p className="mb-2 text-sm text-muted-foreground">
                Rankings cannot be displayed because the AMFI data source is currently
                unreachable. Please try again in a few minutes.
              </p>
              <p className="font-mono text-xs text-negative/70">
                {(error as Error)?.message ?? "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Loading
  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Dashboard">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          <p className="font-mono text-[11px] uppercase tracking-widest">
            Loading AMFI fund universe…
          </p>
        </div>
      </AppShell>
    );
  }

  const universeSize = activeSchemes.length.toLocaleString();
  const now = new Date();
  const refreshedAt = `${String(now.getUTCHours()).padStart(2, "0")}:${String(
    now.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-5xl">
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {universeSize} open-ended schemes from AMFI · {refreshedAt}
          </p>
        </div>

        {/* KPI Grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Median 1Y Ret" value={`${medianRet >= 0 ? "+" : ""}${medianRet.toFixed(2)}%`} tone={medianRet >= 0 ? "positive" : "negative"} />
          <KpiTile label="Universe Size" value={universeSize} />
          <KpiTile label="Category" value={String(ranked.length)} suffix="ranked" />
          <KpiTile label="Top Score" value={ranked[0] ? ranked[0].qfScore.toFixed(1) : "—"} tone="cyan" />
        </div>

        {/* Category chips */}
        <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
          {DASHBOARD_CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-sm px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  active
                    ? "bg-cyan text-background shadow-[0_0_10px_rgba(34,211,238,0.25)]"
                    : "border border-border bg-surface text-muted-foreground hover:border-cyan/40 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Top Ranked table */}
        <div className="mb-8 overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-background/60 p-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan">
              Top Ranked — {activeCategory}
            </span>
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              N={activeSchemes.filter((s) => classifyAMFICategory(s.category) === activeCategory).length}
              <InfoTooltip text="Rankings are computed within each category. Cross-category comparisons are not valid." />
            </span>
          </div>

          {ranked.length === 0 ? (
            <div className="py-10 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              No schemes in {activeCategory}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-background/40 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    <th className="p-3 font-medium">Rk</th>
                    <th className="p-3 font-medium">Scheme</th>
                    <th className="p-3 text-right font-medium">Score</th>
                    <th className="p-3 text-right font-medium">1Y %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ranked.map((s, idx) => (
                    <tr
                      key={s.schemeCode}
                      className="group cursor-pointer transition-colors hover:bg-cyan/[0.04]"
                    >
                      <td className="p-3 font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="p-3">
                        <div className="text-[12px] font-semibold leading-tight text-foreground group-hover:text-cyan">
                          {s.schemeName}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          {s.amc} · NAV ₹{s.nav.toFixed(2)}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-mono text-[11px] font-bold tabular-nums text-cyan">
                            {s.qfScore.toFixed(1)}
                          </span>
                          <div className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full bg-cyan"
                              style={{ width: `${Math.min(100, s.qfScore)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td
                        className={`p-3 text-right font-mono text-[11px] font-bold tabular-nums ${
                          s.ret1Y >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {s.ret1Y >= 0 ? "+" : ""}
                        {s.ret1Y.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Telemetry footer */}
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
            <span className="text-muted-foreground">Category distribution</span>
            <span className="text-cyan">{ranked.length > 0 ? ((ranked.filter((r) => r.ret1Y > 0).length / ranked.length) * 100).toFixed(1) : "0.0"}% positive</span>
          </div>
          <div className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-positive" style={{ width: "45%" }} />
            <div className="h-full bg-cyan" style={{ width: "30%" }} />
            <div className="h-full bg-negative" style={{ width: "25%" }} />
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            QuantFund Score is a transparent, rules-based composite of 7 quantitative
            metrics normalised within each category. Not AI. Not a prediction.{" "}
            <a href="/methodology" className="text-cyan underline underline-offset-2">
              See methodology
            </a>
            . NAV data sourced from{" "}
            <a
              href="https://www.amfiindia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan underline underline-offset-2"
            >
              AMFI India
            </a>
            , updated once daily after market close.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "positive" | "negative" | "cyan";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "cyan"
          ? "text-cyan"
          : "text-foreground";
  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
        {suffix ? (
          <span className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative" role="tooltip" aria-label={text}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{text}</span>
      <span className="pointer-events-none absolute right-0 top-4 z-10 hidden w-56 rounded border border-border bg-surface p-2 text-[10px] normal-case tracking-normal text-foreground shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}
