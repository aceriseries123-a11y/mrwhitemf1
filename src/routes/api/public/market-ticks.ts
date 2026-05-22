import { createFileRoute } from "@tanstack/react-router";

// Yahoo Finance v7 quote endpoint (unofficial but widely used, no auth).
// We proxy server-side to avoid CORS and to add light caching.
const YAHOO = "https://query1.finance.yahoo.com/v7/finance/quote";

// Symbols we request from Yahoo. Gift Nifty doesn't have a stable Yahoo
// symbol; we attempt a few and gracefully fall back to "—" if absent.
const SYMBOLS = [
  "^NSEI",     // NIFTY 50
  "^BSESN",    // SENSEX
  "GC=F",      // Gold futures (USD/oz) — converted to INR/10g
  "INR=X",     // USD/INR
  "NIFTY_F1.NS", // Gift Nifty (best-effort)
];

type Tick = {
  label: string;
  nav: number | null;
  chg: number | null;
  date: string | null;
};

let cache: { at: number; ticks: Tick[] } | null = null;
const TTL_MS = 10_000; // 10s edge cache — Yahoo updates ~every 15s

async function fetchYahoo(): Promise<Record<string, any>> {
  const url = `${YAHOO}?symbols=${encodeURIComponent(SYMBOLS.join(","))}`;
  const res = await fetch(url, {
    headers: {
      // Yahoo returns 401/429 without a UA
      "User-Agent":
        "Mozilla/5.0 (compatible; QuantFundTerminal/1.0; +https://lovable.dev)",
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json: any = await res.json();
  const out: Record<string, any> = {};
  for (const q of json?.quoteResponse?.result ?? []) {
    out[q.symbol] = q;
  }
  return out;
}

function pick(q: any): { nav: number | null; chg: number | null; date: string | null } {
  if (!q) return { nav: null, chg: null, date: null };
  const nav = q.regularMarketPrice ?? null;
  const chg = q.regularMarketChangePercent ?? null;
  const ts = q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null;
  return { nav, chg, date: ts };
}

async function buildTicks(): Promise<Tick[]> {
  const q = await fetchYahoo();

  const nifty = pick(q["^NSEI"]);
  const sensex = pick(q["^BSESN"]);
  const gold = pick(q["GC=F"]);
  const usdinr = pick(q["INR=X"]);
  const gift = pick(q["NIFTY_F1.NS"]);

  // Gold: USD/oz -> INR/10g
  let goldInr: number | null = null;
  if (gold.nav != null && usdinr.nav != null) {
    goldInr = +((gold.nav * usdinr.nav / 31.1035) * 10).toFixed(0);
  }

  return [
    { label: "NIFTY 50", ...nifty },
    { label: "SENSEX", ...sensex },
    { label: "GIFT NIFTY", ...gift },
    { label: "GOLD (₹/10g)", nav: goldInr, chg: gold.chg, date: gold.date },
    { label: "USD/INR", ...usdinr },
  ];
}

export const Route = createFileRoute("/api/public/market-ticks")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const now = Date.now();
          if (cache && now - cache.at < TTL_MS) {
            return Response.json(cache.ticks, {
              headers: {
                "Cache-Control": "public, max-age=10",
                "Access-Control-Allow-Origin": "*",
              },
            });
          }
          const ticks = await buildTicks();
          cache = { at: now, ticks };
          return Response.json(ticks, {
            headers: {
              "Cache-Control": "public, max-age=10",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e: any) {
          // Serve stale cache on upstream failure if available
          if (cache) {
            return Response.json(cache.ticks, {
              headers: {
                "Cache-Control": "public, max-age=5",
                "Access-Control-Allow-Origin": "*",
                "X-Stale": "1",
              },
            });
          }
          return new Response(
            JSON.stringify({ error: e?.message ?? "upstream failed" }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
