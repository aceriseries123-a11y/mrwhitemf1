/**
 * benchmarks.ts
 *
 * AUDIT FIX — P0
 * ──────────────────────────────────────────────────────────────────────────────
 * BEFORE: Weak, inconsistent benchmark mapping. Many categories shared the
 *         wrong index.  This corrupted Alpha, Beta, Sharpe, and relative
 *         performance calculations — the four most important metrics for
 *         cross-fund comparison.
 *
 * AFTER:  One canonical benchmark per QuantFundCategory, aligned with SEBI's
 *         categorisation circular and standard industry practice.
 *
 * Benchmark return source: MFAPI / publicly available index data.
 * All benchmarks use Total Return Index (TRI) where available.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { QuantFundCategory } from "./categories";

// ─── Benchmark descriptor ─────────────────────────────────────────────────────

export interface BenchmarkDescriptor {
  /** Human-readable benchmark name shown in UI */
  name: string;
  /** Short ticker / code used to fetch benchmark NAV history */
  code: string;
  /** Whether this is a Total Return Index */
  isTRI: boolean;
  /** Data source for this benchmark */
  source: "NSE" | "BSE" | "AMFI" | "RBI" | "LBMA";
}

// ─── Benchmark map ────────────────────────────────────────────────────────────
//
// Rationale for each mapping:
//
//  Large Cap      → Nifty 100 TRI
//    SEBI mandates Nifty 50 or Nifty 100 as the reference for large-cap funds.
//    Nifty 100 TRI is used here as it covers the full large-cap universe that
//    funds can invest in.
//
//  Mid Cap        → Nifty Midcap 150 TRI
//    Nifty Midcap 150 is the SEBI-aligned benchmark for mid-cap schemes.
//
//  Small Cap      → Nifty Smallcap 250 TRI
//    Nifty Smallcap 250 TRI is the SEBI-aligned benchmark.
//
//  Flexi Cap      → Nifty 500 TRI
//    No cap restriction → broadest index.
//
//  Multi Cap      → Nifty 500 TRI
//    Same reasoning as Flexi Cap.
//
//  Large & Mid Cap → Nifty LargeMidcap 250 TRI
//    Purpose-built index for this category.
//
//  ELSS           → Nifty 500 TRI
//    No SEBI-mandated benchmark; Nifty 500 TRI is industry convention.
//
//  Focused        → Nifty 500 TRI
//    Can invest across caps.
//
//  Sectoral       → Nifty 500 TRI
//    Sector varies; 500 TRI used as broad market reference.
//    TODO: Per-sector benchmark (e.g. Nifty IT TRI for tech funds).
//
//  Aggressive Hybrid → Nifty 50 Hybrid Composite Debt 65:35 Index
//  Conservative Hybrid → Nifty 50 Hybrid Composite Debt 25:75 Index
//  Balanced Advantage / Dynamic Asset Allocation → Nifty 50 Hybrid Index
//
//  Debt funds     → CRISIL composite indices per sub-category (industry std.)
//
//  Gold           → MCX Gold Spot
//  International  → MSCI World TRI (USD) — note: currency drag applies
//
//  Index Fund / ETF → benchmark should ideally be the fund's own stated index;
//                     using Nifty 50 TRI as a safe default here.

export const BENCHMARK_MAP: Partial<Record<QuantFundCategory, BenchmarkDescriptor>> =
  {
    // ── Equity ──────────────────────────────────────────────────────────────
    "Large Cap": {
      name: "Nifty 100 TRI",
      code: "NIFTY100TRI",
      isTRI: true,
      source: "NSE",
    },
    "Mid Cap": {
      name: "Nifty Midcap 150 TRI",
      code: "NIFTYMIDCAP150TRI",
      isTRI: true,
      source: "NSE",
    },
    "Small Cap": {
      name: "Nifty Smallcap 250 TRI",
      code: "NIFTYSMALLCAP250TRI",
      isTRI: true,
      source: "NSE",
    },
    "Flexi Cap": {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    "Multi Cap": {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    "Large & Mid Cap": {
      name: "Nifty LargeMidcap 250 TRI",
      code: "NIFTYLARGEMIDCAP250TRI",
      isTRI: true,
      source: "NSE",
    },
    ELSS: {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    Focused: {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    "Sectoral / Thematic": {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    "Dividend Yield": {
      name: "Nifty Dividend Opportunities 50 TRI",
      code: "NIFTYDIVOPPOR50TRI",
      isTRI: true,
      source: "NSE",
    },

    // ── Hybrid ──────────────────────────────────────────────────────────────
    "Aggressive Hybrid": {
      name: "Nifty 50 Hybrid Composite Debt 65:35",
      code: "NIFTY50HYBRID6535",
      isTRI: false,
      source: "NSE",
    },
    "Conservative Hybrid": {
      name: "Nifty 50 Hybrid Composite Debt 25:75",
      code: "NIFTY50HYBRID2575",
      isTRI: false,
      source: "NSE",
    },
    "Balanced Advantage": {
      name: "Nifty 50 Hybrid Composite Debt 50:50",
      code: "NIFTY50HYBRID5050",
      isTRI: false,
      source: "NSE",
    },
    Arbitrage: {
      name: "Nifty 50 Arbitrage Index",
      code: "NIFTY50ARB",
      isTRI: false,
      source: "NSE",
    },
    "Multi Asset": {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },

    // ── Debt ────────────────────────────────────────────────────────────────
    Liquid: {
      name: "CRISIL Liquid Fund Index",
      code: "CRISILLIQUID",
      isTRI: false,
      source: "AMFI",
    },
    Overnight: {
      name: "CRISIL Overnight Fund Index",
      code: "CRISILOVERNIGHT",
      isTRI: false,
      source: "AMFI",
    },
    "Ultra Short Duration": {
      name: "CRISIL Ultra Short Term Debt Index",
      code: "CRISILULTRASHT",
      isTRI: false,
      source: "AMFI",
    },
    "Low Duration": {
      name: "CRISIL Low Duration Debt Index",
      code: "CRISILLOWDUR",
      isTRI: false,
      source: "AMFI",
    },
    "Short Duration": {
      name: "CRISIL Short Term Bond Fund Index",
      code: "CRISILSHORTTERM",
      isTRI: false,
      source: "AMFI",
    },
    "Medium Duration": {
      name: "CRISIL Medium Term Debt Index",
      code: "CRISILMEDTERM",
      isTRI: false,
      source: "AMFI",
    },
    "Medium to Long Duration": {
      name: "CRISIL Composite Bond Fund Index",
      code: "CRISILCOMPOSITE",
      isTRI: false,
      source: "AMFI",
    },
    "Long Duration": {
      name: "CRISIL Long Term Gilt Index",
      code: "CRISILLONGGILT",
      isTRI: false,
      source: "AMFI",
    },
    "Dynamic Bond": {
      name: "CRISIL Composite Bond Fund Index",
      code: "CRISILCOMPOSITE",
      isTRI: false,
      source: "AMFI",
    },
    "Corporate Bond": {
      name: "CRISIL Corporate Bond Composite Index",
      code: "CRISILCORPBOND",
      isTRI: false,
      source: "AMFI",
    },
    "Credit Risk": {
      name: "CRISIL Short Term Credit Risk Index",
      code: "CRISILCREDITRISK",
      isTRI: false,
      source: "AMFI",
    },
    "Banking & PSU": {
      name: "CRISIL Banking & PSU Debt Index",
      code: "CRISILBANKPSU",
      isTRI: false,
      source: "AMFI",
    },
    Gilt: {
      name: "CRISIL Gilt Index",
      code: "CRISILGILT",
      isTRI: false,
      source: "AMFI",
    },
    "Gilt 10Y": {
      name: "CRISIL 10 Year Gilt Index",
      code: "CRISIL10YGILT",
      isTRI: false,
      source: "AMFI",
    },
    Floater: {
      name: "CRISIL Liquid Fund Index",
      code: "CRISILLIQUID",
      isTRI: false,
      source: "AMFI",
    },
    "Money Market": {
      name: "CRISIL Money Market Fund Index",
      code: "CRISILMM",
      isTRI: false,
      source: "AMFI",
    },

    // ── Index / ETF ──────────────────────────────────────────────────────────
    "Index Fund": {
      name: "Nifty 50 TRI",
      code: "NIFTY50TRI",
      isTRI: true,
      source: "NSE",
    },
    ETF: {
      name: "Nifty 50 TRI",
      code: "NIFTY50TRI",
      isTRI: true,
      source: "NSE",
    },

    // ── International ────────────────────────────────────────────────────────
    "International / FoF": {
      name: "MSCI World TRI (USD)",
      code: "MSCIWORLD",
      isTRI: true,
      source: "NSE",
    },

    // ── Gold ─────────────────────────────────────────────────────────────────
    Gold: {
      name: "MCX Gold Spot (₹/10g)",
      code: "MCXGOLD",
      isTRI: false,
      source: "LBMA",
    },

    // ── Solution-Oriented ────────────────────────────────────────────────────
    Retirement: {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
    Children: {
      name: "Nifty 500 TRI",
      code: "NIFTY500TRI",
      isTRI: true,
      source: "NSE",
    },
  };

/**
 * Returns the benchmark for a given category, or undefined if none is mapped.
 * Callers should handle undefined gracefully (e.g. skip Alpha/Beta display).
 */
export function getBenchmark(
  category: QuantFundCategory,
): BenchmarkDescriptor | undefined {
  return BENCHMARK_MAP[category];
}
