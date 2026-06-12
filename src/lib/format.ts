// Centralised number formatters — used everywhere so 1.2345% never becomes
// "1.23454321%" on one page and "1.2%" on another.

const nfPct = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfPctSigned = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const nfCurr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const nfNum = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

/** Format a fraction (0.0734) as "7.34%". Null/NaN → "—". */
export function fmtPct(v: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  const pct = v * 100;
  return `${(opts.signed ? nfPctSigned : nfPct).format(pct)}%`;
}

/** Already-percent number (7.34) → "7.34%". */
export function fmtPctRaw(v: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  return `${(opts.signed ? nfPctSigned : nfPct).format(v)}%`;
}

export function fmtCurr(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return nfCurr.format(v);
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** "12-Jun-2026" → "12 Jun 2026". Returns input unchanged if unparseable. */
export function fmtAmfiDate(d: string | null | undefined): string {
  if (!d) return "—";
  return d.replace(/-/g, " ");
}
