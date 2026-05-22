// Real AMFI + MFAPI data layer.
// All scheme IDs are real AMFI scheme codes (e.g. "119598").
// NAV history fetched lazily from https://api.mfapi.in.
// Cached in localStorage with 6h TTL.

import { useEffect, useMemo, useRef, useState } from "react";
import { getBenchmarkCode } from "./benchmarks";
async function fetchWithTimeout(
  url: string,
  timeout = 10000
) {
  const controller = new AbortController();

  const id = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(id);
  }
}

const AMFI_URL = "https://corsproxy.io/?https://www.amfiindia.com/spages/NAVAll.txt";
const MFAPI = (code: string) => `https://api.mfapi.in/mf/${code}`;
const TTL_MS = 6 * 60 * 60 * 1000;
const SCHEMES_CACHE_KEY = "amfi:schemes:v3:real-codes-only";
const CACHE_EXPIRY_MS = 1000 * 60 * 60 * 6;

function isRealSchemeCode(code: string): boolean {
  return /^\d{5,6}$/.test(code);
}

function sanitizeSchemes(rows: Scheme[] | null): Scheme[] | null {
  if (!rows) return null;
  const clean = rows.filter(s => isRealSchemeCode(String(s.schemeCode)) && Number.isFinite(s.nav));
  return clean.length ? clean : null;
}

// ----- Types -----
export type Scheme = {
  schemeCode: string;
  schemeName: string;
  nav: number;
  navDate: string; // DD-MMM-YYYY
  category: string;      // AMFI category header
  group: FundGroup;      // broad group
  bucket: string;        // narrower bucket label
  amc: string;
  aum?: number | null;
};

export type FundGroup = "Equity" | "Hybrid" | "Debt" | "Index" | "Commodity" | "International" | "Solution" | "Other";

export type Returns = {
  r1Y: number | null; r3Y: number | null; r5Y: number | null;
  r7Y: number | null; r10Y: number | null;
};

export type Risk = {
  sharpe: number | null; sortino: number | null;
  alpha: number | null; beta: number | null;
  downsideCapture?: number | null;
  upsideCapture?: number | null;
  maxDrawdown: number | null; stdDev: number | null;
};

export type Metrics = Returns & Risk & {
  aiScore: number | null;
  rollingWinRate: number | null;
};

// ----- Cache helpers -----
function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || Date.now() - obj.t > TTL_MS) return null;
    return obj.v as T;
  } catch { return null; }
}
function lsSet(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* quota */ }
}

// ----- AMFI parser -----
function classify(category: string): { group: FundGroup; bucket: string } {
  const c = category.toLowerCase();
  if (c.includes("etf") || c.includes("index fund")) return { group: "Index", bucket: "Index/ETF" };
  if (c.includes("gold")) return { group: "Commodity", bucket: "Gold" };
  if (c.includes("silver")) return { group: "Commodity", bucket: "Silver" };
  if (c.includes("overseas") || c.includes("international") || c.includes("foreign")) return { group: "International", bucket: "International" };
  if (c.includes("solution")) return { group: "Solution", bucket: "Solution Oriented" };
  if (c.includes("hybrid") || c.includes("balanced") || c.includes("multi asset") || c.includes("arbitrage") || c.includes("conservative") || c.includes("aggressive") || c.includes("equity savings") || c.includes("dynamic asset")) return { group: "Hybrid", bucket: "Hybrid" };
  if (c.includes("debt") || c.includes("liquid") || c.includes("gilt") || c.includes("bond") || c.includes("duration") || c.includes("floater") || c.includes("money market") || c.includes("overnight") || c.includes("credit risk") || c.includes("banking and psu") || c.includes("ultra short")) return { group: "Debt", bucket: "Debt" };
  if (c.includes("large cap")) return { group: "Equity", bucket: "Large Cap" };
  if (c.includes("large & mid") || c.includes("large and mid")) return { group: "Equity", bucket: "Large & Mid Cap" };
  if (c.includes("mid cap")) return { group: "Equity", bucket: "Mid Cap" };
  if (c.includes("small cap")) return { group: "Equity", bucket: "Small Cap" };
  if (c.includes("flexi")) return { group: "Equity", bucket: "Flexi Cap" };
  if (c.includes("multi cap")) return { group: "Equity", bucket: "Multi Cap" };
  if (c.includes("elss") || c.includes("tax")) return { group: "Equity", bucket: "ELSS" };
  if (c.includes("focused")) return { group: "Equity", bucket: "Focused" };
  if (c.includes("contra") || c.includes("value")) return { group: "Equity", bucket: "Value/Contra" };
  if (c.includes("dividend")) return { group: "Equity", bucket: "Dividend Yield" };
  if (c.includes("sectoral") || c.includes("thematic")) return { group: "Equity", bucket: "Sectoral/Thematic" };
  if (c.includes("equity")) return { group: "Equity", bucket: "Equity Other" };
  return { group: "Other", bucket: "Other" };
}

function inferAMC(name: string): string {
  const stops = /\b(mutual|fund|scheme|growth|direct|regular|plan|option|payout|reinvestment|idcw|dividend)\b/i;
  const parts = name.split(/\s+/);
  const out: string[] = [];
  for (const w of parts) {
    if (stops.test(w)) break;
    out.push(w);
    if (out.length >= 3) break;
  }
  return out.join(" ") || "—";
}

function parseAMFI(text: string): Scheme[] {
  const lines = text.split("\n");
  const out: Scheme[] = [];
  let currentCategory = "";
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("Scheme Code")) continue;
    if (!line.includes(";")) { currentCategory = line; continue; }
    const parts = line.split(";");
    if (parts.length < 6) continue;
    const schemeCode = parts[0].trim();
    const schemeName = parts[3].trim();
    const nav = parseFloat(parts[4]);
    const navDate = parts[5].trim();
    if (!isRealSchemeCode(schemeCode) || !schemeName || isNaN(nav)) continue;
    if (seen.has(schemeCode)) continue;
    seen.add(schemeCode);
    const { group, bucket } = classify(currentCategory);
    out.push({
      schemeCode, schemeName, nav, navDate,
      category: currentCategory, group, bucket,
      amc: inferAMC(schemeName),
    });
  }
  return out;
}

// ----- AMFI loader hook -----
let _schemesPromise: Promise<Scheme[]> | null = null;
async function loadSchemes(): Promise<Scheme[]> {
  const cached = sanitizeSchemes(lsGet<Scheme[]>(SCHEMES_CACHE_KEY));
  if (cached) return cached;
  try {
    const res = await fetchWithTimeout(AMFI_URL, 10000);
    if (!res.ok) throw new Error(`AMFI ${res.status}`);
    const text = await res.text();
    const parsed = parseAMFI(text);
    if (parsed.length > 0) {
      lsSet(SCHEMES_CACHE_KEY, parsed);
      return parsed;
    }
  } catch { /* fall back to curated real AMFI codes below */ }
  const fallback = await loadCuratedSchemes();
  lsSet(SCHEMES_CACHE_KEY, fallback);
  return fallback;
}

async function loadCuratedSchemes(): Promise<Scheme[]> {
  const rows: Scheme[] = [];

for (const schemeCode of CURATED_CODES.slice(0, 10)) {

 const h = await fetchNavHistory(schemeCode);
  const last = h.series[h.series.length - 1];

  if (!last) continue;
    const schemeName = h.meta.scheme_name || `AMFI ${schemeCode}`;
    const category = h.meta.scheme_category || "Other";
    const { group, bucket } = classify(category + " " + schemeName);
    rows.push({
      schemeCode,
      schemeName,
      nav: last.nav,
      navDate: last.date.toISOString().slice(0, 10),
      category,
      group,
      bucket,
      amc: h.meta.fund_house || inferAMC(schemeName),
    } satisfies Scheme);
  };
  return rows.filter((s): s is Scheme => !!s && isRealSchemeCode(s.schemeCode));
}

export function useAMFISchemes() {
  const [data, setData] = useState<Scheme[] | null>(() => sanitizeSchemes(lsGet<Scheme[]>(SCHEMES_CACHE_KEY)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (data) return;
    if (!_schemesPromise) _schemesPromise = loadSchemes();
    _schemesPromise.then(setData).catch(e => setError(String(e)));
  }, [data]);
  return { schemes: data, loading: !data && !error, error };
}

export function getScheme(schemes: Scheme[] | null, code: string): Scheme | undefined {
  return schemes?.find(s => s.schemeCode === code);
}

// ----- NAV history -----
export type NavPoint = { date: Date; nav: number };
export type NavMeta = { fund_house?: string; scheme_type?: string; scheme_category?: string; scheme_name?: string };
export type NavHistory = { meta: NavMeta; series: NavPoint[] };

function parseIN(s: string): Date {
  const [d, m, y] = s.split("-").map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

const _navMem = new Map<string, Promise<NavHistory>>();
export async function fetchNavHistory(code: string): Promise<NavHistory> {
  if (_navMem.has(code)) return _navMem.get(code)!;
  const cached = lsGet<{ meta: NavMeta; raw: { date: string; nav: string }[] }>(`mfapi:${code}`);
  const p = (async () => {
    let meta: NavMeta = {};
    let raw: { date: string; nav: string }[];
    if (cached) {
      meta = cached.meta; raw = cached.raw;
    } else {
      const r = await fetch(MFAPI(code));
      if (!r.ok) throw new Error(`mfapi ${r.status}`);
      const j = await r.json() as { meta: NavMeta; data: { date: string; nav: string }[] };
      meta = j.meta || {};
      raw = j.data || [];
      lsSet(`mfapi:${code}`, { meta, raw });
    }
    const series: NavPoint[] = raw.map(d => ({ date: parseIN(d.date), nav: Number(String(d.nav).replace(/,/g, ""))}))
      .filter(p => Number.isFinite(p.nav) && p.nav > 0 && !isNaN(p.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { meta, series };
  })();
  _navMem.set(code, p);
  p.catch(() => _navMem.delete(code));
  return p;
}

export function useNavHistory(code: string | undefined) {
  const [data, setData] = useState<NavHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    setLoading(true); setError(null);
    fetchNavHistory(code).then(h => { setData(h); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [code]);
  return { history: data, loading, error };
}

// ----- Metric computation -----
function navAt(series: NavPoint[], target: Date): number | null {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date < target) lo = mid + 1; else hi = mid;
  }
  const pick = series[lo];
  const prev = series[Math.max(0, lo - 1)];
  const closer = Math.abs(pick.date.getTime() - target.getTime()) <= Math.abs(prev.date.getTime() - target.getTime()) ? pick : prev;
  const diffDays = Math.abs(closer.date.getTime() - target.getTime()) / 86400000;
  if (diffDays > 45) return null;
  return closer.nav;
}

function cagr(start: number, end: number, years: number): number {
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function computeReturns(history: NavHistory): Returns {
  const s = history.series;
  if (s.length < 30) return { r1Y: null, r3Y: null, r5Y: null, r7Y: null, r10Y: null };
  const last = s[s.length - 1];
  const today = last.date;
  const get = (y: number): number | null => {
    const t = new Date(today); t.setFullYear(t.getFullYear() - y);
    if (s[0].date > t) return null;
    const n = navAt(s, t); if (n == null) return null;
    return cagr(n, last.nav, y);
  };
  return {
    r1Y: get(1), r3Y: get(3), r5Y: get(5), r7Y: get(7), r10Y: get(10),
  };
}

export function computeRiskFromSeries(fundSeries: NavPoint[], benchSeries: NavPoint[]): Risk {
  if (fundSeries.length < 50) return { sharpe: null, sortino: null, alpha: null, beta: null, maxDrawdown: null, stdDev: null };
  const cutoff = new Date(fundSeries[fundSeries.length - 1].date);
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  const fs = fundSeries.filter(p => p.date >= cutoff);
  const bs = benchSeries.filter(p => p.date >= cutoff);
  const n = Math.min(fs.length, bs.length);
  if (n < 50) return { sharpe: null, sortino: null, alpha: null, beta: null, maxDrawdown: null, stdDev: null };
  const f = fs.slice(fs.length - n).map(p => p.nav);
  const b = bs.slice(bs.length - n).map(p => p.nav);
  const fR: number[] = []; const bR: number[] = [];
  for (let i = 1; i < n; i++) {
    fR.push((f[i] - f[i - 1]) / f[i - 1]);
    bR.push((b[i] - b[i - 1]) / b[i - 1]);
  }
  const rfDaily = 0.065 / 365;
  const meanF = fR.reduce((s, v) => s + v, 0) / fR.length;
  const stdF = Math.sqrt(fR.reduce((s, v) => s + (v - meanF) ** 2, 0) / fR.length);
  const downs = fR.filter(v => v < rfDaily);
  const downStd = downs.length > 1
    ? Math.sqrt(downs.reduce((s, v) => s + (v - rfDaily) ** 2, 0) / downs.length)
    : stdF;
  const sharpe = stdF > 0 ? ((meanF - rfDaily) / stdF) * Math.sqrt(252) : null;
  const sortino = downStd > 0 ? ((meanF - rfDaily) / downStd) * Math.sqrt(252) : null;
  const meanB = bR.reduce((s, v) => s + v, 0) / bR.length;
  const varB = bR.reduce((s, v) => s + (v - meanB) ** 2, 0) / bR.length;
  const cov = fR.reduce((s, v, i) => s + (v - meanF) * (bR[i] - meanB), 0) / fR.length;
  const beta = varB > 0 ? cov / varB : null;
  const alpha = beta != null ? ((meanF - rfDaily) - beta * (meanB - rfDaily)) * 252 * 100 : null;
  let peak = f[0]; let maxDD = 0;
  for (const v of f) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }
  const stdDevAnn = stdF * Math.sqrt(252) * 100;
  return {
    sharpe: sharpe != null ? +sharpe.toFixed(2) : null,
    sortino: sortino != null ? +sortino.toFixed(2) : null,
    alpha: alpha != null ? +alpha.toFixed(2) : null,
    beta: beta != null ? +beta.toFixed(2) : null,
    maxDrawdown: +(-maxDD * 100).toFixed(1),
    stdDev: +stdDevAnn.toFixed(2),
  };
}

export function rollingWinRate(history: NavHistory): number | null {
  const s = history.series;
  if (s.length < 252 * 3) return null;
  let wins = 0, total = 0;
  for (let i = 252; i < s.length; i += 21) {
    const start = s[i - 252].nav;
    const end = s[i].nav;
    if (end > start) wins++;
    total++;
  }
  return total ? wins / total : null;
}

export function computeAIScore(m: Metrics & { expense?: number | null }): number | null {
  if (m.r1Y == null && m.r3Y == null && m.r5Y == null && m.sharpe == null && m.maxDrawdown == null) return null;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const returnScore =
  clamp(
    ((m.r3Y ?? m.r1Y ?? 0) * 1.8) +
    ((m.r5Y ?? 0) * 1.2)
  );

const sharpeScore =
  clamp(((m.sharpe ?? 0) * 22) + 35);

const sortinoScore =
  clamp(((m.sortino ?? 0) * 16) + 30);

const consistencyScore =
  clamp((m.rollingWinRate ?? 0) * 100);

const drawdownScore =
  clamp(100 + (m.maxDrawdown ?? -35) * 2.5);

const alphaScore =
  clamp(50 + (m.alpha ?? 0) * 8);

const betaScore =
  clamp(100 - Math.abs((m.beta ?? 1) - 1) * 25);

const downsideProtection =
  clamp(100 + ((m.downsideCapture ?? 100) - 100) * -0.7);

const upsideCapture =
  clamp((m.upsideCapture ?? 100) * 0.7);

const expensePenalty =
  clamp(100 - ((m.expense ?? 1.5) * 22));

const longevityScore =
  m.r10Y != null
    ? 100
    : m.r7Y != null
    ? 90
    : m.r5Y != null
    ? 75
    : 55;

const volatilityScore =
  clamp(100 - ((m.stdDev ?? 20) * 2.2));

const raw =
  returnScore * 0.16 +
  sharpeScore * 0.14 +
  sortinoScore * 0.12 +
  consistencyScore * 0.13 +
  drawdownScore * 0.12 +
  alphaScore * 0.08 +
  betaScore * 0.05 +
  downsideProtection * 0.06 +
  upsideCapture * 0.04 +
  expensePenalty * 0.04 +
  longevityScore * 0.03 +
  volatilityScore * 0.03;

return Math.round(clamp(raw));
}

// ----- Benchmark NAV (NIFTY 50 ETF proxy) -----

let _benchPromise: Promise<NavHistory> | null = null;

export function getBenchHistory(
  category: string = "large cap"
): Promise<NavHistory> {
  if (!_benchPromise) {
    _benchPromise = fetchNavHistory(
      getBenchmarkCode(category)
    );
  }

  return _benchPromise;
}

// ----- Combined metrics fetcher (lazy, cached in-memory) -----
const _metricsMem = new Map<string, Promise<Metrics>>();
export function fetchMetrics(code: string): Promise<Metrics> {
  if (_metricsMem.has(code)) return _metricsMem.get(code)!;
  const p = (async () => {
    const hist = await fetchNavHistory(code);
    const bench = await getBenchHistory();
    const ret = computeReturns(hist);
    const risk = computeRiskFromSeries(hist.series, bench.series);
    const win = rollingWinRate(hist);
    const base: Metrics = { ...ret, ...risk, aiScore: null, rollingWinRate: win };
    base.aiScore = computeAIScore(base);
    return base;
  })();
  _metricsMem.set(code, p);
  p.catch(() => _metricsMem.delete(code));
  return p;
}

// ----- Index ticker (real-time via /api/public/market-ticks) -----
export type Tick = { label: string; nav: number | null; chg: number | null; date: string | null };

export async function fetchTicks(): Promise<Tick[]> {
  const res = await fetch("/api/public/market-ticks", { cache: "no-store" });
  if (!res.ok) throw new Error(`ticks ${res.status}`);
  return (await res.json()) as Tick[];
}

export function useTicks() {
  const [ticks, setTicks] = useState<Tick[] | null>(null);

  useEffect(() => {
    let alive = true;

    const run = () =>
      fetchTicks()
        .then(t => { if (alive) setTicks(t); })
        .catch(() => {});

    run();
    // Yahoo refresh ~15s; poll every 15s to stay near real-time without abuse
    const id = setInterval(run, 15_000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return ticks;
}


// ----- Lazy metrics hook with batched fetching -----
export function useMetrics(code: string | undefined) {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetchMetrics(code).then(x => { setM(x); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);
  return { metrics: m, loading };
}

export function useLazyMetrics(code: string, enabled = true) {
  const ref = useRef<HTMLTableRowElement | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  useEffect(() => {
    if (!visible || m) return;
    fetchMetrics(code).then(setM).catch(() => {});
  }, [visible, code, m]);
  return { ref, metrics: m };
}

// ----- Curated popular fund codes -----
export const CURATED_CODES: string[] = [
  "119598", "120503", "118989", "120586", "118550", "120465", "118473", "118269", "120822", "118528",
  "118825", "120505", "120716", "120684", "120828", "119242", "118533", "125354", "120819", "120251",
  "118565", "120821", "119602"
];

export async function warmMetrics(codes: string[], concurrency = 4): Promise<void> {
  const queue = [...new Set(codes)];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length) {
        const c = queue.shift()!;
        try { await fetchMetrics(c); } catch { /* skip */ }
      }
    })());
  }
  await Promise.all(workers);
}

export function useCuratedMetrics(codes: string[] = CURATED_CODES) {
  const uniq = useMemo(() => [...new Set(codes)], [codes]);
  const [byCode, setByCode] = useState<Record<string, Metrics>>({});
  useEffect(() => {
    let alive = true;
    let buffer: Record<string, Metrics> = {};
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      if (!alive || Object.keys(buffer).length === 0) return;
      const next = buffer; buffer = {};
      setByCode(prev => ({ ...prev, ...next }));
    };
    (async () => {
      const queue = [...uniq];
      const run = async () => {
        while (queue.length) {
          const c = queue.shift()!;
          try {
            const m = await fetchMetrics(c);
            if (!alive) return;
            buffer[c] = m;
            if (!scheduled) {
              scheduled = true;
              setTimeout(flush, 150);
            }
          } catch { /* skip */ }
        }
      };
      await Promise.all([run(), run(), run(), run()]);
      flush();
    })();
    return () => { alive = false; };
  }, [uniq]);
  return byCode;
}

export const fmt = {
  pct: (v: number | null | undefined, d = 2) => (v == null || isNaN(v as number)) ? "—" : `${(v as number).toFixed(d)}%`,
  num: (v: number | null | undefined, d = 2) => (v == null || isNaN(v as number)) ? "—" : (v as number).toFixed(d),
  score: (v: number | null | undefined) => (v == null || isNaN(v as number)) ? "—" : `${Math.round(v as number)}`,
};
