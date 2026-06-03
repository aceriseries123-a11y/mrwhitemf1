/**
 * risk-free-rate.ts
 *
 * AUDIT FIX — P1
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: Risk-free rate was referenced inconsistently across different files,
 *         causing Sharpe and Sortino ratios to be incomparable across funds.
 *
 * AFTER:  Single source of truth.  The rate is the prevailing 91-day
 *         Government of India Treasury Bill yield — the standard risk-free
 *         proxy used by the Indian mutual fund industry (SEBI / AMFI convention).
 *
 * Usage:
 *   import { RISK_FREE_RATE_ANNUAL, riskFreeRateDaily } from "./risk-free-rate";
 *
 *   const sharpe = (annualisedReturn - RISK_FREE_RATE_ANNUAL) / annualStdDev;
 * ──────────────────────────────────────────────────────────────────────────────
 */

/**
 * 91-day G-Sec T-Bill yield, annualised.
 *
 * Source: RBI (https://www.rbi.org.in/Scripts/BS_ViewBulletin.aspx)
 * Update frequency: Weekly.  Hardcoded here for build-time reproducibility;
 * a production system should fetch this from an RBI endpoint or a trusted
 * data vendor and cache with a weekly TTL.
 *
 * Last updated: June 2025
 * Current value: 6.50% per annum
 *
 * ⚠️  This value MUST be reviewed and updated whenever:
 *   1. RBI changes the repo rate significantly (±50 bps)
 *   2. The 91-day T-Bill yield diverges materially from this value
 *
 * Transparency: Displayed in the UI as "Risk-Free Rate: 6.50% (91-day T-Bill)"
 */
export const RISK_FREE_RATE_ANNUAL = 0.065; // 6.50% p.a.

/**
 * Daily risk-free rate, assuming 252 trading days per year.
 * Used when computing daily Sharpe/Sortino from a daily return series.
 */
export const TRADING_DAYS_PER_YEAR = 252;

export const riskFreeRateDaily =
  RISK_FREE_RATE_ANNUAL / TRADING_DAYS_PER_YEAR;

/**
 * Human-readable label for the risk-free rate, shown in metric tooltips
 * and the transparency layer.
 */
export const RISK_FREE_RATE_LABEL = "6.50% p.a. (91-day G-Sec T-Bill, Jun 2025)";

/**
 * Source URL for auditors and power users.
 */
export const RISK_FREE_RATE_SOURCE_URL =
  "https://www.rbi.org.in/Scripts/BS_ViewBulletin.aspx";
