/**
 * scheme-ter.ts — Expense Ratio (TER) via Kuvera/captnemo
 *
 * Flow per code:
 *   1) GET https://api.mfapi.in/mf/{code}        → meta.isin_growth
 *   2) GET https://mf.captnemo.in/kuvera/{isin}  → expense_ratio / ter / expense
 *   3) Return as % (e.g. 0.5 = 0.5%)
 *
 * Cached per-code in worker memory for 24h. Client passes ?codes=c1,c2,...
 */
import { createFileRoute } from "@tanstack/react-router";

type Cached = { at: number; ter: number | null };
const cache = new Map<string, Cached>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODES = 60;

async function fetchTer(code: string): Promise<number | null> {
  try {
    const metaR = await fetch(`https://api.mfapi.in/mf/${code}`, {
      headers: { "User-Agent": "QuantFundTerminal/1.0" },
    });
    if (!metaR.ok) return null;
    const meta: { meta?: { isin_growth?: string | null } } = await metaR.json();
    const isin = meta?.meta?.isin_growth;
    if (!isin) return null;

    const kr = await fetch(`https://mf.captnemo.in/kuvera/${isin}`, {
      redirect: "follow",
      headers: { "User-Agent": "QuantFundTerminal/1.0" },
    });
    if (!kr.ok) return null;
    const arr = await kr.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(arr) || !arr.length) return null;

    const item = arr[0];
    // Try common field names for expense ratio
    const raw =
      item?.["expense_ratio"] ??
      item?.["ter"] ??
      item?.["expense"] ??
      item?.["expenseRatio"] ??
      item?.["expense_ratio_direct"] ??
      null;
    if (raw == null) return null;
    const val = Number(raw);
    // Sanity check: TER should be between 0.01% and 5%
    return Number.isFinite(val) && val > 0 && val < 5 ? val : null;
  } catch {
    return null;
  }
}

async function getTer(code: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(code);
  if (hit && now - hit.at < TTL_MS) return hit.ter;
  const ter = await fetchTer(code);
  cache.set(code, { at: now, ter });
  return ter;
}

export const Route = createFileRoute("/api/public/scheme-ter")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("codes") || "";
        const codes = Array.from(
          new Set(
            raw
              .split(",")
              .map(s => s.trim())
              .filter(s => /^\d{5,6}$/.test(s))
          )
        ).slice(0, MAX_CODES);

        const entries = await Promise.all(
          codes.map(async c => [c, await getTer(c)] as const)
        );
        const map: Record<string, number> = {};
        for (const [c, v] of entries) if (v != null) map[c] = v;

        return Response.json(map, {
          headers: {
            "Cache-Control": "public, max-age=43200",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
