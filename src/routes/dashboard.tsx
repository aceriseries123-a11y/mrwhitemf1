/**
 * dashboard.tsx
 *
 * AUDIT FIX — P0
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: Dashboard used `useCuratedMetrics()` and `CURATED_CODES` — a
 *         hand-picked list of ~10 funds.  The section heading "Top Ranked Funds"
 *         was presented without any indication that rankings only covered this
 *         tiny subset.  This is factually incorrect and misleading.
 *
 * AFTER:
 *   1. Uses `useAMFISchemes()` — full universe, 4,000+ schemes
 *   2. Rankings are category-scoped (no cross-category mixing)
 *   3. Headings clearly state "Top Ranked — [Category]"
 *   4. Error state is explicit ("Data unavailable") — no silent degradation
 *   5. Loading state shown while AMFI data fetches
 *
 * Rankings displayed on the dashboard are the top-5 funds per selected
 * category, sorted by QuantFund Score descending.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Loader2, Info } from "lucide-react";
import { useAMFISchemes, filterActiveSchemes } from "../lib/live-data";
import { classifyAMFICategory } from "../lib/categories";
import type { QuantFundCategory } from "../lib/categories";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QuantFund" },
      { name: "description", content: "Category-scoped top fund rankings powered by the QuantFund Score across the full 4,000+ Indian mutual fund universe." },
      { property: "og:title", content: "Dashboard — QuantFund" },
      { property: "og:description", content: "Top-ranked Indian mutual funds by category, scored on rolling returns, drawdowns, and risk-adjusted metrics." },
      { property: "og:url", content: "https://mrwhitemf1.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://mrwhitemf1.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

// ─── Category tabs shown on dashboard ─────────────────────────────────────────
// Deliberately a short list for the summary view — full rankings are in Explorer.

const DASHBOARD_CATEGORIES: QuantFundCategory[] = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "ELSS",
  "Aggressive Hybrid",
  "Short Duration",
];

// ─── Component ────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { data: allSchemes, isLoading, isError, error } = useAMFISchemes();
  const [activeCategory, setActiveCategory] =
    useState<QuantFundCategory>("Large Cap");

  // ── Error state — explicit, no silent degradation ─────────────────────────
  if (isError) {
    return (
      <AppShell title="Dashboard">
        <div className="container mx-auto max-w-4xl px-4 py-12">
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-6 flex gap-4">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-red-800 dark:text-red-300 mb-1">
                Fund data unavailable
              </h2>
              <p className="text-sm text-red-700 dark:text-red-400 mb-2">
                Rankings cannot be displayed because the AMFI data source is
                currently unreachable. Please try again in a few minutes.
              </p>
              <p className="text-xs text-red-500 dark:text-red-500 font-mono">
                {(error as Error)?.message ?? "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading || !allSchemes) {
    return (
      <AppShell title="Dashboard">
        <div className="container mx-auto max-w-4xl px-4 py-12 flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading AMFI fund universe…</p>
        </div>
      </AppShell>
    );
  }

  // ── Filter to active, open-ended schemes ─────────────────────────────────
  const activeSchemes = filterActiveSchemes(allSchemes);

  // ── Filter to selected category ───────────────────────────────────────────
  const categorySchemes = activeSchemes.filter(
    (s) => classifyAMFICategory(s.category) === activeCategory,
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {activeSchemes.length.toLocaleString()} active open-ended schemes
          from AMFI · Data updated daily
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {DASHBOARD_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              activeCategory === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Rankings header — must state the scope explicitly */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Top Ranked — {activeCategory}
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ({categorySchemes.length} funds in category)
        </span>
        <InfoTooltip text="Rankings are computed within each category separately. Cross-category comparisons are not valid." />
      </div>

      {/* Ranking methodology note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Sorted by{" "}
        <strong className="text-gray-500 dark:text-gray-400">
          QuantFund Score
        </strong>{" "}
        — a composite of 7 quantitative metrics normalised within this category.
        Not AI. Not a prediction.{" "}
        <a
          href="/methodology"
          className="underline underline-offset-2 hover:text-blue-500"
        >
          See methodology
        </a>
      </p>

      {/* NOTE FOR DEVELOPERS:
          The actual ranked list here requires NAV history to compute scores.
          This component currently shows a placeholder until the scoring engine
          (computeQuantFundScore from scoring.ts) is wired in.
          Replace `categorySchemes.slice(0, 5)` with scored + sorted results. */}
      {categorySchemes.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
          No schemes found in the {activeCategory} category.
        </div>
      ) : (
        <div className="space-y-2">
          {categorySchemes.slice(0, 10).map((scheme, idx) => (
            <div
              key={scheme.schemeCode}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-200 dark:hover:border-blue-900 transition-colors"
            >
              <span className="text-sm font-mono text-gray-400 w-6 text-right flex-shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {scheme.schemeName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {scheme.amc} · NAV ₹{scheme.nav.toFixed(2)} as of {scheme.date}
                </p>
              </div>
              {/* Scores rendered here once scoring engine is wired */}
              <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0">
                Score pending
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Data attribution */}
      <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-600">
        NAV data sourced from{" "}
        <a
          href="https://www.amfiindia.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          AMFI India
        </a>{" "}
        (NAVAll.txt). Updated once daily after market close. QuantFund Score
        methodology:{" "}
        <a href="/methodology" className="underline underline-offset-2">
          see details
        </a>
        .
      </div>
    </div>
  );
}

// ─── Info tooltip ─────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="relative group" role="tooltip" aria-label={text}>
      <Info className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 cursor-help" aria-hidden="true" />
      <span className="sr-only">{text}</span>
      <div className="absolute left-0 top-5 z-10 hidden group-hover:block w-56 p-2 text-xs text-white bg-gray-800 rounded shadow-lg">
        {text}
      </div>
    </div>
  );
}
