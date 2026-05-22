import { createFileRoute } from "@tanstack/react-router";

// Yahoo Finance public chart endpoint — works without auth/crumb.
const CHART = (sym: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;

type Tick = {
  label: string;
  nav: number | null;
  chg: number | null;
  date: string | null;
};

let cache: { at: number; ticks: Tick[] } | null = null;
const TTL_MS = 10_000;

async function fetchQuote(symbol: string): Promise<{ price: number | null; prev: number | null; ts: number | null }> {
  try {
    const res = await fetch(CHART(symbol), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; QuantFundTerminal/1.0; +https://lovable.dev)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { price: null, prev: null, ts: null };
    const json: any = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return { price: null, prev: null, ts: null };
    return {
      price: meta.regularMarketPrice ?? null,
      prev: meta.chartPreviousClose ?? meta.previousClose ?? null,
      ts: meta.regularMarketTime ?? null,
    };
  } catch {
    return { price: null, prev: null, ts: null };
  }
}

function pctChg(price: number | null, prev: number | null) {
  if (price == null || prev == null || prev === 0) return null;
  return +(((price - prev) / prev) * 100).toFixed(2);
}

async function buildTicks(): Promise<Tick[]> {
  // Fire all requests in parallel. Gift Nifty symbol: best-effort.
  const [nifty, sensex, gold, usdinr, gift] = await Promise.all([
    fetchQuote("^NSEI"),
    fetchQuote("^BSESN"),
    fetchQuote("GC=F"),
    fetchQuote("INR=X"),
    fetchQuote("NIFTY_F1.NS"),
  ]);

  // Gold: USD/oz -> INR/10g
  let goldNav: number | null = null;
  let goldPrev: number | null = null;
  if (gold.price != null && usdinr.price != null) {
    goldNav = +((gold.price * usdinr.price / 31.1035) * 10).toFixed(0);
  }
  if (gold.prev != null && usdinr.prev != null) {
    goldPrev = +((gold.prev * usdinr.prev / 31.1035) * 10).toFixed(0);
  }

  const tsIso = (ts: number | null) =>
    ts ? new Date(ts * 1000).toISOString() : null;

  return [
    { label: "NIFTY 50", nav: nifty.price, chg: pctChg(nifty.price, nifty.prev), date: tsIso(nifty.ts) },
    { label: "SENSEX", nav: sensex.price, chg: pctChg(sensex.price, sensex.prev), date: tsIso(sensex.ts) },
    { label: "GIFT NIFTY", nav: gift.price, chg: pctChg(gift.price, gift.prev), date: tsIso(gift.ts) },
    { label: "GOLD (₹/10g)", nav: goldNav, chg: pctChg(goldNav, goldPrev), date: tsIso(gold.ts) },
    { label: "USD/INR", nav: usdinr.price, chg: pctChg(usdinr.price, usdinr.prev), date: tsIso(usdinr.ts) },
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
          if (cache) {
            return Response.json(cache.ticks, {
              headers: { "X-Stale": "1", "Access-Control-Allow-Origin": "*" },
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
