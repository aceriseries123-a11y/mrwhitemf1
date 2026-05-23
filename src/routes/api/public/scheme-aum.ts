import { createFileRoute } from "@tanstack/react-router";

// AMFI publishes monthly scheme-wise AUM disclosure. Free real-time per-scheme
// AUM is not available from any public feed; AMFI's monthly file is the most
// accurate freely-available source. We fetch it once and cache by scheme code.
//
// File: https://portal.amfiindia.com/DownloadAAUM.aspx?aumrptid=44 (xls/csv)
// Easier alternative: AMFI publishes an aggregate text dump. We try a few
// known endpoints; if all fail we return {} so the UI shows "—".

type AumMap = Record<string, number>; // schemeCode -> AUM in INR crores

let cache: { at: number; map: AumMap } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — AMFI updates monthly

const SOURCES = [
  // Community mirror of parsed AMFI monthly disclosure (best-effort).
  "https://raw.githubusercontent.com/captn3m0/india-mutual-fund-aum/main/latest.json",
];

async function loadAum(): Promise<AumMap> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "QuantFundTerminal/1.0" },
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      const map: AumMap = {};
      // Accept either { "119598": 12345.6, ... } or [{schemeCode,aum},...]
      if (Array.isArray(j)) {
        for (const row of j) {
          const code = String(row.schemeCode ?? row.code ?? "").trim();
          const aum = Number(row.aum ?? row.AUM ?? row.aaum);
          if (/^\d{5,6}$/.test(code) && Number.isFinite(aum)) map[code] = aum;
        }
      } else if (j && typeof j === "object") {
        for (const k of Object.keys(j)) {
          const aum = Number(j[k]);
          if (/^\d{5,6}$/.test(k) && Number.isFinite(aum)) map[k] = aum;
        }
      }
      if (Object.keys(map).length) return map;
    } catch {
      /* try next */
    }
  }
  return {};
}

export const Route = createFileRoute("/api/public/scheme-aum")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        if (!cache || now - cache.at > TTL_MS) {
          const map = await loadAum();
          cache = { at: now, map };
        }
        return Response.json(cache.map, {
          headers: {
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
