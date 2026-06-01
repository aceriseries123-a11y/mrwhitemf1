import { createFileRoute } from "@tanstack/react-router";

// Proxies AMFI's full daily NAV dump (~10k+ schemes) through our own origin
// so the browser doesn't depend on a flaky public CORS proxy.
// Cached at the edge for 1h — AMFI publishes once per day after market close.

let cache: { at: number; body: string } | null = null;
const TTL_MS = 60 * 60 * 1000;

const SOURCES = [
  "https://www.amfiindia.com/spages/NAVAll.txt",
  "https://portal.amfiindia.com/spages/NAVAll.txt",
];

export const Route = createFileRoute("/api/public/amfi-navall")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        if (cache && now - cache.at < TTL_MS) {
          return new Response(cache.body, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
              "Access-Control-Allow-Origin": "*",
              "X-Cache": "HIT",
            },
          });
        }
        for (const url of SOURCES) {
          try {
            const r = await fetch(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (compatible; QuantFundTerminal/1.0)",
                Accept: "text/plain,*/*",
              },
            });
            if (!r.ok) continue;
            const body = await r.text();
            if (body.length < 1000) continue;
            cache = { at: now, body };
            return new Response(body, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "X-Cache": "MISS",
              },
            });
          } catch {
            /* try next */
          }
        }
        return new Response("AMFI upstream unavailable", {
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
