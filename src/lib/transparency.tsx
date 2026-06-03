/**
 * transparency.ts / MetricSource component
 *
 * AUDIT FIX — P1 (Transparency Layer)
 * ──────────────────────────────────────────────────────────────────────────────
 * Every metric displayed in QuantFund must have a visible provenance badge:
 *
 *   Official metrics   → "Source: AMFI · Updated: <timestamp>"
 *   Calculated metrics → "Calculated from NAV history · Methodology"
 *   Model metrics      → "QuantFund proprietary score"
 *
 * This file exports:
 *   - MetricSource React component (badge rendered next to metric values)
 *   - MetricMeta type (data contract for provenance)
 *   - Pre-built MetricMeta instances for common metrics
 * ──────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { RISK_FREE_RATE_LABEL, RISK_FREE_RATE_SOURCE_URL } from "./risk-free-rate";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricSourceType = "official" | "calculated" | "model";

export interface MetricMeta {
  type: MetricSourceType;
  /** Short label, e.g. "AMFI" or "Calculated" */
  label: string;
  /** One-line explanation of how the metric was derived */
  description: string;
  /** ISO timestamp of last update (for official metrics) */
  updatedAt?: string;
  /** Optional link to methodology doc or source */
  sourceUrl?: string;
}

// ─── Pre-built MetricMeta instances ──────────────────────────────────────────

export const NAV_META: MetricMeta = {
  type: "official",
  label: "AMFI",
  description: "Net Asset Value sourced from AMFI NAVAll.txt, published daily.",
  sourceUrl: "https://www.amfiindia.com/spages/NAVAll.txt",
};

export const CAGR_META: MetricMeta = {
  type: "calculated",
  label: "Calculated",
  description:
    "Compound Annual Growth Rate calculated from NAV history: " +
    "(endNAV / startNAV)^(1/years) − 1. No survivorship bias correction applied.",
  sourceUrl: "/methodology",
};

export const SHARPE_META: MetricMeta = {
  type: "calculated",
  label: "Calculated",
  description:
    `Sharpe Ratio = (Annualised Return − Risk-Free Rate) / Annualised Std Dev. ` +
    `Risk-free rate: ${RISK_FREE_RATE_LABEL}.`,
  sourceUrl: RISK_FREE_RATE_SOURCE_URL,
};

export const SORTINO_META: MetricMeta = {
  type: "calculated",
  label: "Calculated",
  description:
    `Sortino Ratio = (Annualised Return − Risk-Free Rate) / Downside Deviation. ` +
    `Risk-free rate: ${RISK_FREE_RATE_LABEL}. Downside deviation computed against MAR = 0.`,
  sourceUrl: RISK_FREE_RATE_SOURCE_URL,
};

export const DRAWDOWN_META: MetricMeta = {
  type: "calculated",
  label: "Calculated",
  description:
    "Maximum peak-to-trough drawdown calculated from the full available NAV history.",
  sourceUrl: "/methodology",
};

export const ALPHA_META: MetricMeta = {
  type: "calculated",
  label: "Calculated",
  description:
    "Jensen's Alpha: fund return minus (risk-free rate + beta × (benchmark return − risk-free rate)). " +
    "Beta estimated via OLS regression of daily fund returns vs benchmark returns.",
  sourceUrl: "/methodology",
};

export const QUANTFUND_SCORE_META: MetricMeta = {
  type: "model",
  label: "QuantFund Score",
  description:
    "Composite score of 7 quantitative metrics, normalised within each fund category. " +
    "Not AI. Rules-based formula — see methodology for full weight breakdown.",
  sourceUrl: "/methodology",
};

export const EXPENSE_RATIO_META: MetricMeta = {
  type: "official",
  label: "AMFI",
  description:
    "Annual expense ratio as disclosed by the AMC in the scheme information document (SID). " +
    "Sourced from AMFI portfolio disclosures.",
  sourceUrl: "https://www.amfiindia.com",
};

// ─── React component ──────────────────────────────────────────────────────────

interface MetricSourceProps {
  meta: MetricMeta;
  /** If true, renders as a compact inline dot + tooltip only */
  compact?: boolean;
}

const TYPE_STYLES: Record<MetricSourceType, string> = {
  official:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900",
  calculated:
    "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  model:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900",
};

export function MetricSource({ meta, compact = false }: MetricSourceProps) {
  if (compact) {
    return (
      <span className="relative group inline-flex items-center">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ml-1 cursor-help ${
            meta.type === "official"
              ? "bg-green-500"
              : meta.type === "model"
              ? "bg-blue-500"
              : "bg-gray-400"
          }`}
        />
        <span className="absolute bottom-4 left-0 z-20 hidden group-hover:block w-64 p-2 text-xs text-white bg-gray-800 rounded shadow-lg leading-relaxed">
          <strong>{meta.label}</strong> · {meta.description}
          {meta.sourceUrl && (
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-1 text-blue-300 underline"
            >
              See source ↗
            </a>
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${TYPE_STYLES[meta.type]}`}
    >
      {meta.label}
      {meta.sourceUrl && (
        <a
          href={meta.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-60 hover:opacity-100"
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </span>
  );
}
