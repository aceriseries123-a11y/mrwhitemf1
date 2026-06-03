/**
 * ai-insights.tsx
 *
 * AUDIT FIX — P0
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: A `const INSIGHTS = [...]` array of static strings was displayed
 *         as live market intelligence:
 *           "Market regime: mid-cycle"
 *           "Momentum shift detected"
 *           "Downside risk alert"
 *           "Smart allocation opportunity"
 *         These were 100% hardcoded — not derived from any data.  Displaying
 *         them as live AI analysis is actively misleading to investors.
 *
 * AFTER:  The page is refactored to a "Research Desk (Beta)" holding page.
 *         It clearly communicates:
 *           1. What will eventually live here (data-driven signals)
 *           2. That no signals are currently available
 *           3. What the user CAN rely on now (QuantFund Score, category rankings)
 *
 * DO NOT re-add any static insight strings.
 * DO NOT label any feature "AI" until a real model is in production.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical, TrendingUp, ShieldCheck, BarChart3 } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/research-desk")({
  component: ResearchDeskPage,
});

// ─── Planned features (for the roadmap section) ───────────────────────────────
// These describe what will exist once real signal generation is built.
// They are clearly labelled as "Coming Soon" — NOT as live analysis.

const PLANNED_SIGNALS = [
  {
    icon: TrendingUp,
    title: "Rolling Momentum Signals",
    description:
      "Funds showing sustained outperformance vs their category benchmark " +
      "over trailing 3-month and 6-month windows, recomputed weekly from NAV data.",
    status: "In development",
  },
  {
    icon: ShieldCheck,
    title: "Drawdown Alerts",
    description:
      "Notification when a fund's current drawdown from its all-time high " +
      "exceeds historical norms for its category (e.g. > 1 standard deviation).",
    status: "Planned",
  },
  {
    icon: BarChart3,
    title: "Factor Exposure Analysis",
    description:
      "Rolling regression of fund returns against size, value, and momentum " +
      "factors to surface unintended style drift.",
    status: "Planned",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

function ResearchDeskPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <FlaskConical className="h-7 w-7 text-blue-500" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Research Desk
        </h1>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Beta
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Quantitative signals derived from verified NAV and benchmark data.
        Currently under development — no signals are live yet.
      </p>

      {/* Status banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-4 mb-10">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>What's available now:</strong> Accurate NAV data,
          category-scoped rankings, and QuantFund Scores are live in the{" "}
          <Link
            to="/dashboard"
            className="underline underline-offset-2 font-medium"
          >
            Dashboard
          </Link>{" "}
          and{" "}
          <Link
            to="/explorer"
            className="underline underline-offset-2 font-medium"
          >
            Fund Explorer
          </Link>
          . Research Desk signals will be added once the underlying models are
          validated against historical data.
        </p>
      </div>

      {/* Planned signals */}
      <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide text-xs">
        Planned signals
      </h2>

      <div className="space-y-4">
        {PLANNED_SIGNALS.map((signal) => (
          <div
            key={signal.title}
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
          >
            <div className="flex items-start gap-3">
              <signal.icon className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                    {signal.title}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {signal.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {signal.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Transparency note */}
      <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
        <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed">
          QuantFund does not use AI or machine learning in its current scoring
          model. The QuantFund Score is a transparent, rules-based composite of
          seven quantitative metrics (Sharpe, Sortino, Max Drawdown, Rolling
          Return Consistency, Alpha, Expense Ratio, Downside Protection),
          normalised within each fund category. See the methodology page for
          full details.
        </p>
      </div>
    </div>
  );
}
