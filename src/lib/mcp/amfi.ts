/**
 * amfi.ts — server-side AMFI universe loader for MCP tool handlers.
 *
 * Runs inside the Cloudflare Worker, so it fetches amfiindia.com directly
 * (no CORS). Cached in-memory per Worker instance for 1h — AMFI publishes
 * once daily after market close.
 */

export interface AmfiScheme {
  schemeCode: string;
  schemeName: string;
  isin: string | null;
  nav: number;
  date: string;
  amc: string;
  category: string;
  schemeType: string;
}

const SOURCES = [
  "https://www.amfiindia.com/spages/NAVAll.txt",
  "https://portal.amfiindia.com/spages/NAVAll.txt",
];
const TTL_MS = 60 * 60 * 1000;

let cache: { at: number; data: AmfiScheme[] } | null = null;

function parse(raw: string): AmfiScheme[] {
  const lines = raw.split("\n").map((l) => l.trim());
  const out: AmfiScheme[] = [];
  let amc = "", type = "", cat = "";
  for (const line of lines) {
    if (!line || line.startsWith("Scheme Code")) continue;
    const m = line.match(
      /^(Open Ended Schemes|Close Ended Schemes|Interval Fund|Exchange Traded Fund)\((.+)\)$/i,
    );
    if (m) { type = m[1].trim(); cat = m[2].trim(); continue; }
    if (!line.includes(";") && line.length > 3) { amc = line; continue; }
    const p = line.split(";");
    if (p.length < 6) continue;
    const nav = parseFloat(p[4]);
    if (!p[0] || !isFinite(nav) || nav <= 0) continue;
    out.push({
      schemeCode: p[0].trim(),
      schemeName: p[3].trim(),
      isin: p[1]?.trim() || null,
      nav,
      date: p[5]?.trim() ?? "",
      amc,
      category: cat,
      schemeType: type,
    });
  }
  return out;
}

export async function loadSchemes(): Promise<AmfiScheme[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "QuantFundMCP/1.0", Accept: "text/plain,*/*" },
      });
      if (!r.ok) continue;
      const text = await r.text();
      if (text.length < 1000) continue;
      const parsed = parse(text);
      if (parsed.length < 100) continue;
      cache = { at: now, data: parsed };
      return parsed;
    } catch { /* try next */ }
  }
  throw new Error("AMFI upstream unavailable");
}
