/**
 * methodology.tsx — Full Calculation Transparency Page
 *
 * Every formula, every weight, every data source. No mock data. No placeholders.
 * This page exists to let users verify every number they see on QuantFund.
 */
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Database, TrendingUp, Shield, Zap, BarChart2, Trophy, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RISK_FREE_RATE_ANNUAL, RISK_FREE_RATE_LABEL, RISK_FREE_RATE_SOURCE_URL, TRADING_DAYS_PER_YEAR } from "@/lib/risk-free-rate";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — QuantFund" },
      { name: "description", content: "Full transparency: every formula, weight, and data source used in QuantFund scoring." },
    ],
  }),
  component: MethodologyPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ id, icon: Icon, title, subtitle, children }: {
  id: string; icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan/10 border border-cyan/20">
          <Icon className="h-4 w-4 text-cyan" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-cyan/30 bg-cyan/5" : "border-border bg-surface"}`}>
      {children}
    </div>
  );
}

function Formula({ label, expr, notes }: { label: string; expr: string; notes?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <pre className="overflow-x-auto font-mono text-[12px] font-bold text-cyan leading-relaxed whitespace-pre-wrap">{expr}</pre>
      {notes && <p className="mt-2 font-mono text-[10px] text-muted-foreground leading-relaxed">{notes}</p>}
    </div>
  );
}

function WeightRow({ label, weight, desc }: { label: string; weight: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="w-16 shrink-0 rounded bg-cyan/10 px-2 py-0.5 text-center font-mono text-[10px] font-bold text-cyan">{weight}</span>
      <div>
        <span className="font-mono text-[11px] font-semibold text-foreground">{label}</span>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function Callout({ type, children }: { type: "info" | "warn" | "good"; children: React.ReactNode }) {
  const styles = {
    info:  "border-cyan/30 bg-cyan/5 text-cyan",
    warn:  "border-warning/30 bg-warning/5 text-warning",
    good:  "border-positive/30 bg-positive/5 text-positive",
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${styles[type]}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-mono text-[11px] leading-relaxed">{children}</p>
    </div>
  );
}

// ─── TOC ─────────────────────────────────────────────────────────────────────

const TOC = [
  { id: "data-sources",    label: "1. Data Sources" },
  { id: "nav-processing",  label: "2. NAV Processing" },
  { id: "trailing-returns",label: "3. Trailing Returns" },
  { id: "annual-avg",      label: "4. Annual Return Average" },
  { id: "rolling-returns", label: "5. Rolling Returns" },
  { id: "benchmark",       label: "6. Category Benchmark" },
  { id: "risk-metrics",    label: "7. Risk Metrics" },
  { id: "capture-ratios",  label: "8. Capture Ratios" },
  { id: "alpha-metrics",   label: "9. Alpha & IR" },
  { id: "engine-score",    label: "10. Engine Score (7-Pillar)" },
  { id: "confidence",      label: "11. Confidence Score" },
  { id: "explore-score",   label: "12. Explore Score" },
  { id: "return-score",    label: "13. Return Score" },
  { id: "ranking-score",   label: "14. Ranking Score" },
  { id: "limitations",     label: "15. Known Limitations" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function MethodologyPage() {
  return (
    <AppShell title="Methodology">
      <div className="mx-auto max-w-[1100px] space-y-2 pb-20">

        {/* Hero */}
        <div className="rounded-xl border border-cyan/30 bg-cyan/5 px-6 py-5">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Methodology & Calculation Transparency</h1>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground max-w-3xl">
            Every number you see on QuantFund is computed in real-time from authentic NAV data fetched directly from
            <span className="text-foreground font-bold"> mfapi.in</span> (which sources from AMFI India).
            There is no mock data, no imputed averages, no placeholder values.
            If a metric cannot be computed (e.g., insufficient history), we show <span className="text-foreground font-bold">—</span> rather than fabricate a number.
            This page shows the exact formula used for every displayed value.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-positive/30 bg-positive/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-positive">100% real data</span>
            <span className="rounded-md border border-positive/30 bg-positive/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-positive">No mock values</span>
            <span className="rounded-md border border-positive/30 bg-positive/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-positive">Open formulas</span>
            <span className="rounded-md border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan">RFR: {RISK_FREE_RATE_LABEL}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">

          {/* TOC sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-20 rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground px-1">Contents</p>
              {TOC.map(t => (
                <a key={t.id} href={`#${t.id}`}
                  className="block rounded-lg px-2 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  {t.label}
                </a>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-10">

            {/* 1. Data Sources */}
            <Section id="data-sources" icon={Database} title="1. Data Sources" subtitle="All external APIs used — no third-party enrichment">
              <Card>
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-[11px] font-bold text-cyan mb-1">Fund Universe — AMFI India NAVAll.txt</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      Full list of all registered Indian mutual fund schemes fetched from
                      <span className="text-foreground"> https://www.amfiindia.com/spages/NAVAll.txt</span>.
                      Parsed to extract: Scheme Code, Scheme Name, ISIN, NAV, Date, AMC, Category.
                      Filtered to <span className="text-foreground font-bold">Direct Growth</span> schemes only (no dividend, no regular plans)
                      to ensure fair comparison (no distributor commission bias).
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] font-bold text-cyan mb-1">Historical NAV Series — mfapi.in</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      Full NAV history (every trading day since scheme inception) from
                      <span className="text-foreground"> https://api.mfapi.in/mf/&#123;scheme_code&#125;</span>.
                      Returns <span className="text-foreground">date (DD-MM-YYYY)</span> and <span className="text-foreground">nav (string, ₹)</span> fields only.
                      No AUM, no expense ratio, no holdings data available from this API.
                      NAV dates are business days only (no weekends/holidays).
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] font-bold text-cyan mb-1">Risk-Free Rate — RBI 91-day G-Sec T-Bill</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      <span className="text-foreground font-bold">{RISK_FREE_RATE_ANNUAL * 100}% per annum</span> ({RISK_FREE_RATE_LABEL}).
                      Standard proxy used by SEBI/AMFI for Indian fund performance measurement.
                      Hardcoded for reproducibility; updated when RBI changes repo rate by ≥50 bps.
                      Source: <a href={RISK_FREE_RATE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-cyan underline">{RISK_FREE_RATE_SOURCE_URL}</a>
                    </p>
                  </div>
                  <Callout type="warn">
                    AUM (Fund Size) and Expense Ratio (TER) are NOT available in the public mfapi.in or AMFI NAVAll.txt feeds.
                    These require AMC-level scraping or a paid data vendor. Both are shown as "—" on all pages.
                  </Callout>
                </div>
              </Card>
            </Section>

            {/* 2. NAV Processing */}
            <Section id="nav-processing" icon={TrendingUp} title="2. NAV Series Processing" subtitle="How raw API data becomes a clean time series">
              <Card>
                <div className="space-y-3">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    The raw mfapi.in response lists NAV data newest-first. We reverse it to oldest-first (chronological ascending).
                    Each point is parsed as:
                  </p>
                  <Formula
                    label="NAV Point structure"
                    expr={`NavPoint {\n  t: number   // JS timestamp ms — Date.UTC(yyyy, mm-1, dd)\n  d: string   // ISO date "YYYY-MM-DD"\n  nav: number // ₹ NAV (validated: must be finite and > 0)\n}`}
                    notes="Points with nav ≤ 0 or non-finite are discarded. Weekend/holiday gaps are natural (mfapi only returns trading days)."
                  />
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    A binary-search helper <span className="text-foreground font-mono">navAtOrBefore(series, targetT)</span> finds
                    the last available NAV point at or before any target timestamp.
                    This handles weekend gaps correctly: if you ask for "NAV on Saturday",
                    it returns Friday's NAV.
                  </p>
                </div>
              </Card>
            </Section>

            {/* 3. Trailing Returns */}
            <Section id="trailing-returns" icon={TrendingUp} title="3. Trailing Returns (1W / 1M / 3M / 6M / 1Y / 3Y / 5Y / 7Y / 10Y)" subtitle="Point-to-point from latest NAV date">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Simple return — for periods < 1 year (1W, 1M, 3M, 6M)"
                    expr={`simpleReturn = (NAV_end / NAV_start) - 1\n\nWhere:\n  NAV_end   = latest available NAV (today)\n  NAV_start = navAtOrBefore(series, today - period_in_ms)`}
                    notes="1W = 1/52 years, 1M = 1/12 years, 3M = 3/12 years, 6M = 6/12 years. Shown as % (e.g., 3.21%)."
                  />
                  <Formula
                    label="CAGR — for periods ≥ 1 year (1Y, 3Y, 5Y, 7Y, 10Y)"
                    expr={`CAGR = (NAV_end / NAV_start) ^ (1 / actual_years) - 1\n\nWhere:\n  actual_years = (end_timestamp - start_timestamp) / YEAR_MS\n  YEAR_MS      = 365 × 24 × 3600 × 1000\n\nQuality gate: actual_years must be ≥ 85% of requested window.\n  3Y CAGR requires ≥ 2.55 years of actual data.\n  If gate fails → null (shown as "—")`}
                    notes="CAGR = Compound Annual Growth Rate. Adjusts for actual duration not exact calendar period."
                  />
                  <Callout type="info">
                    All return computations start from the LATEST available NAV point (most recent trading day in the mfapi.in response),
                    not from today's date. This ensures every fund is measured to the same endpoint with no look-ahead bias.
                  </Callout>
                </div>
              </Card>
            </Section>

            {/* 4. Annual Return Average */}
            <Section id="annual-avg" icon={TrendingUp} title="4. Annual Return Average" subtitle="Arithmetic mean of calendar-year simple returns — NOT rolling windows">
              <Card accent>
                <div className="space-y-3">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    This is the most important calculation to understand. Many sites use <span className="text-negative font-bold">rolling averages</span> which
                    can look artificially smooth. QuantFund computes the <span className="text-positive font-bold">actual calendar-year return</span> for every
                    year the fund has existed, then averages them.
                  </p>
                  <Formula
                    label="Calendar Year Return — for each year Y"
                    expr={`yearReturn(Y) = (NAV_last_day_of_Y / NAV_first_day_of_Y) - 1\n\nWhere:\n  NAV_first_day_of_Y = first available NAV in calendar year Y\n  NAV_last_day_of_Y  = navAtOrBefore(series, Dec 31 of Y)\n\nYear is included if:\n  - At least one NAV point exists in year Y\n  - End point is also in year Y (not spilling to next year)\n  - Y < current calendar year (incomplete years excluded)`}
                    notes="For the year 2020: first_day = first NAV date in 2020, last_day = last NAV date in Dec 2020."
                  />
                  <Formula
                    label="Annual Return Average"
                    expr={`annualReturnAvg = mean(yearReturn(Y1), yearReturn(Y2), ..., yearReturn(Yn))\n                = Σ yearReturn(Yi) / n\n\nExample (fund with 5 years of history, 2019–2023):\n  2019: +12.4%\n  2020: -10.1%\n  2021: +28.3%\n  2022: -6.8%\n  2023: +15.2%\n  ─────────────────\n  Average: (12.4 - 10.1 + 28.3 - 6.8 + 15.2) / 5 = +7.8%`}
                    notes="This is arithmetic mean, not geometric mean (CAGR). It shows the average experience in any given year."
                  />
                  <Callout type="good">
                    Why calendar years instead of rolling windows? Calendar years match how investors actually experience fund performance
                    — in tax statements, portfolio reviews, and annual reports. A fund that returns +30% in 2021 and -20% in 2022 should
                    show both, not a smoothed average that hides the bad year.
                  </Callout>
                </div>
              </Card>
            </Section>

            {/* 5. Rolling Returns */}
            <Section id="rolling-returns" icon={TrendingUp} title="5. Rolling Returns (Rolling 1Y+)" subtitle="% of all 1-year windows with positive return — timestamp-based, not index-based">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Rolling Positive Rate — for window = 1 year"
                    expr={`rollingPositiveRate(series, 1 year) =\n  count(windows where fund_return > 0) / total_valid_windows\n\nFor each NAV point at time T (going backwards through series):\n  startPoint = navAtOrBefore(series, T - 1_YEAR_MS)\n  if not found → stop\n  if (T - startPoint.t) < 0.85 × 1_YEAR_MS → skip (insufficient data)\n  window_return = NAV(T) / NAV(startPoint) - 1\n  if window_return > 0 → pos_count++\n  total_count++\n\nResult = pos_count / total_count (requires ≥ 8 valid windows)`}
                    notes="1_YEAR_MS = 365 × 86_400_000 ms. Uses TIMESTAMP comparison, not array-index offsets, so weekend/holiday gaps don't skew the window."
                  />
                  <Callout type="info">
                    Example: If a fund has 3 years of daily data (~756 NAV points), there are ~504 valid rolling 1-year windows
                    (each day is the endpoint of one window). If 420 of those windows show positive return,
                    Rolling 1Y+ = 420/504 = 83%. This means on any random day you invested for exactly 1 year,
                    you had an 83% chance of a positive return.
                  </Callout>
                </div>
              </Card>
            </Section>

            {/* 6. Benchmark */}
            <Section id="benchmark" icon={BarChart2} title="6. Category Equal-Weighted Benchmark" subtitle="Built from peer NAV series — no index data required">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Benchmark construction"
                    expr={`For each date D, for each fund F in the same category:\n  normalizedNAV(F, D) = (NAV(F, D) / NAV(F, inception)) × 100\n\nbenchmark(D) = mean(normalizedNAV(F, D) for all F with data on D)\n\nRequirements:\n  - At least 5 peer funds in the category\n  - Each date needs ≥ max(3, 30% of peers) funds reporting\n  - Minimum 100 benchmark dates to be considered valid`}
                    notes="Normalizing to 100 at inception removes the absolute-NAV differences between funds, so all peers contribute equally regardless of their starting price."
                  />
                  <Callout type="info">
                    This benchmark is used for: Beta, Upside/Downside Capture, Information Ratio, Tracking Error, Jensen's Alpha, and Consistency Beat Rate.
                    Funds with fewer than 5 peers in their category get null for all benchmark-relative metrics.
                  </Callout>
                </div>
              </Card>
            </Section>

            {/* 7. Risk Metrics */}
            <Section id="risk-metrics" icon={Shield} title="7. Risk Metrics" subtitle="Computed from daily log returns — all from real NAV history">
              <Card>
                <div className="space-y-4">
                  <Formula
                    label="Daily Log Return"
                    expr={`logReturn(t) = ln(NAV(t) / NAV(t-1))\n\nUsed instead of simple return because:\n  - Additive over time (sum of daily = total log return)\n  - Better approximation for continuous compounding\n  - More stable for statistical computations`}
                  />
                  <Formula
                    label="Standard Deviation (Annualised Volatility)"
                    expr={`σ_annual = sqrt(variance(logReturns) × ${TRADING_DAYS_PER_YEAR})\n\nWhere:\n  variance = Σ (r_i - mean)² / (n - 1)  (sample variance)\n  ${TRADING_DAYS_PER_YEAR} = trading days per year\n\nRequires ≥ 30 log returns. Uses last 3×252 = 756 data points (3Y window).`}
                  />
                  <Formula
                    label="Sharpe Ratio"
                    expr={`Sharpe = (R_fund − R_f) / σ_annual\n\nWhere:\n  R_fund = 3Y CAGR (falls back to 1Y CAGR if 3Y unavailable)\n  R_f    = ${RISK_FREE_RATE_ANNUAL * 100}% (91-day G-Sec T-Bill)\n  σ      = annualised std dev of daily log returns\n\nHigher = better. > 1.0 is good, > 2.0 is excellent.`}
                  />
                  <Formula
                    label="Sortino Ratio"
                    expr={`Sortino = (R_fund − R_f) / σ_downside\n\nWhere:\n  σ_downside = sqrt(Σ min(0, r_i)² / n × ${TRADING_DAYS_PER_YEAR})\n             = annualised downside deviation (only negative days count)\n\nBetter than Sharpe for asymmetric return distributions because\nit only penalises downside volatility, not upside volatility.`}
                  />
                  <Formula
                    label="Maximum Drawdown"
                    expr={`MaxDD = min over all T of: (NAV(T) − peak_NAV_before_T) / peak_NAV_before_T\n\nWhere peak_NAV_before_T = max(NAV(s) for all s ≤ T)\n\nRange: [-1, 0]. -0.35 means the worst peak-to-trough loss was 35%.\nComputed over the FULL series (not just recent 3Y).`}
                  />
                  <Formula
                    label="Calmar Ratio"
                    expr={`Calmar = 3Y_CAGR / |MaxDrawdown|\n\nExample: 3Y CAGR = 15%, MaxDD = -25%\n  Calmar = 0.15 / 0.25 = 0.60\n\nHigher = better. Shows how much compounded return per unit of worst-case loss.\nTypical range: 0.2 – 3.0. Null if MaxDD = 0 or fund has less than 3Y history.`}
                  />
                  <Formula
                    label="Omega Ratio"
                    expr={`Omega = Σ max(0, r_i − MAR) / Σ max(0, MAR − r_i)\n\nWhere:\n  MAR = daily risk-free rate = ${RISK_FREE_RATE_ANNUAL}/${TRADING_DAYS_PER_YEAR} ≈ ${(RISK_FREE_RATE_ANNUAL/TRADING_DAYS_PER_YEAR*10000).toFixed(2)} bps/day\n  Numerator   = sum of daily returns ABOVE the daily RFR\n  Denominator = sum of daily shortfalls BELOW the daily RFR\n\nHigher = more return per unit of shortfall risk. Requires ≥ 60 log returns.`}
                  />
                </div>
              </Card>
            </Section>

            {/* 8. Capture Ratios */}
            <Section id="capture-ratios" icon={BarChart2} title="8. Upside & Downside Capture Ratios" subtitle="Monthly aggregation vs category equal-weighted benchmark">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Monthly log return aggregation"
                    expr={`For each month M:\n  fundMonthRet(M)  = Σ logReturn_fund(t)  for all t in month M\n  benchMonthRet(M) = Σ logReturn_bench(t) for all t in month M`}
                    notes="Using log returns means daily contributions add up correctly to monthly."
                  />
                  <Formula
                    label="Upside Capture Ratio"
                    expr={`UpsideCapture = (Σ fundRet in UP months / Σ benchRet in UP months) × 100\n\nWhere UP months = months where benchMonthRet > 0\n\nRequires ≥ 6 up months. Result in %.\nExample: 105% = fund captured 105% of what benchmark gained on up months.\nDisplay: "+105.0%" — positive % = good (captured more of rally)`}
                  />
                  <Formula
                    label="Downside Capture Ratio"
                    expr={`DownsideCapture = (Σ fundRet in DOWN months / Σ benchRet in DOWN months) × 100\n\nWhere DOWN months = months where benchMonthRet < 0\n\nRequires ≥ 6 down months. Result in %.\nExample: 82% = fund only fell 82% as much as benchmark on bad months.\nDisplay: "82.0%" — colored green if < 80%, red if > 100% (lower = better)`}
                  />
                  <Formula
                    label="Capture Score (Explorer page -10 to +10 display)"
                    expr={`UpsideScore   = clamp((upsideCapture   - 100) / 10, -10, +10)\nDownsideScore = clamp((100 - downsideCapture) / 10, -10, +10)\n\nUpsideCapture = 120% → UpsideScore   = (120-100)/10 = +2.0\nUpsideCapture =  80% → UpsideScore   = (80-100)/10  = -2.0\nDownside      =  80% → DownsideScore = (100-80)/10  = +2.0  (good)\nDownside      = 120% → DownsideScore = (100-120)/10 = -2.0  (bad)\n\nBoth range: -10 = extremely bad, 0 = neutral (matches benchmark), +10 = excellent`}
                    notes="This normalisation makes the scale intuitive: +X means the fund beats the benchmark by X×10% on that dimension."
                  />
                </div>
              </Card>
            </Section>

            {/* 9. Alpha & IR */}
            <Section id="alpha-metrics" icon={Zap} title="9. Alpha & Information Ratio" subtitle="Benchmark-relative excess return metrics">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Beta (Market Sensitivity)"
                    expr={`β = Cov(fundDailyLogRet, benchDailyLogRet) / Var(benchDailyLogRet)\n\nFor each overlapping trading day:\n  fund_ret_t  = ln(NAV_fund(t)  / NAV_fund(t-1))\n  bench_ret_t = ln(NAV_bench(t) / NAV_bench(t-1))\n\nβ = 1.0 → fund moves exactly with benchmark\nβ > 1.0 → fund amplifies benchmark moves (higher volatility)\nβ < 1.0 → fund is less sensitive to benchmark swings`}
                  />
                  <Formula
                    label="Tracking Error (annualised)"
                    expr={`excessReturn(t) = fundLogRet(t) - benchLogRet(t)\nTE = sqrt(Var(excessReturn) × ${TRADING_DAYS_PER_YEAR})\n\nLower TE = fund moves closely with benchmark (typical for index funds).\nHigher TE = actively managed fund diverges more from benchmark.`}
                  />
                  <Formula
                    label="Information Ratio"
                    expr={`IR = (mean(excessReturn) × ${TRADING_DAYS_PER_YEAR}) / TE\n   = annualised_alpha / tracking_error\n\nHigher IR = more alpha generated per unit of active risk taken.\n> 0.5 is good, > 1.0 is excellent.`}
                  />
                  <Formula
                    label="Jensen's Alpha"
                    expr={`α = R_fund − (R_f + β × (R_bench − R_f))\n\nWhere all rates are 3Y CAGR:\n  R_fund  = fund's 3Y CAGR\n  R_f     = ${RISK_FREE_RATE_ANNUAL * 100}% (risk-free rate)\n  β       = Beta computed above\n  R_bench = benchmark's 3Y CAGR\n\nPositive α = fund outperformed after accounting for market exposure and risk.\nNegative α = fund underperformed on risk-adjusted basis.`}
                  />
                </div>
              </Card>
            </Section>

            {/* 10. Engine Score */}
            <Section id="engine-score" icon={Zap} title="10. Engine Score — 7-Pillar System" subtitle="Category-relative percentile scoring · 0–100 · each metric ranked within peer group">
              <Card accent>
                <div className="space-y-4">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    Each metric is percentile-ranked within its category peer group. A fund scoring in the 80th percentile
                    on Sharpe Ratio gets 80 points for that metric. This makes scores category-relative —
                    a Liquid fund is only compared to other Liquid funds, not to Small Cap funds.
                  </p>
                  <Formula
                    label="Percentile normalization"
                    expr={`score(fund, metric) = percentileRank(metric_value, all_peer_values)\n\npercentileRank(v, arr) = (count(x < v) + 0.5 × count(x = v)) / n × 100\n\nFor lower-is-better metrics (Beta, StdDev, MaxDD, DownsideCapture):\n  score = 100 - percentileRank(v, arr)`}
                  />
                  <div className="space-y-2 mt-2">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-cyan font-bold">7 Pillars & Weights</p>
                    <WeightRow label="Pillar 1 — Long-Term Consistency" weight="23%" desc="3Y CAGR(5) + 5Y CAGR(6) + 7Y CAGR(5) + 10Y CAGR(4) + Consistency Beat Rate(3). Numbers in parens = sub-weight within pillar." />
                    <WeightRow label="Pillar 2 — Short-Term Performance" weight="5%" desc="1M(1) + 3M(2) + 6M(2). Recent momentum signal." />
                    <WeightRow label="Pillar 3 — Risk-Adjusted Returns" weight="20%" desc="Sortino(10) + Sharpe(6) + Information Ratio(4). Quality of return per unit of risk." />
                    <WeightRow label="Pillar 4 — Downside Protection" weight="20%" desc="Downside Capture(8) + Upside Capture(3) + MaxDD(4) + Recovery Months(3) + Beta(1) + StdDev(1). How well the fund protects capital in bad markets." />
                    <WeightRow label="Pillar 5 — Cost Efficiency" weight="15%" desc="Jensen's Alpha(9) + Tracking Error(6, lower=better). Net alpha after market exposure cost." />
                    <WeightRow label="Pillar 6 — Portfolio Quality" weight="12%" desc="Calmar(4) + Omega(5) + Rolling StdDev of 1Y returns(3, lower=better)." />
                    <WeightRow label="Pillar 7 — Management & AUM" weight="5%" desc="Longevity bonus(1) + Rolling 1Y+(2) + Bear Market Return(2)." />
                  </div>
                  <Formula
                    label="Pillar score aggregation"
                    expr={`pillarScore = Σ (metric_percentile × metric_sub_weight) / Σ available_weights\n\nIf a metric is null (insufficient data), its sub-weight is redistributed\nto the remaining available metrics within the same pillar.\nIf ALL metrics in a pillar are null → pillar is excluded from total.`}
                  />
                  <Formula
                    label="Fund Score"
                    expr={`fundScore = Σ (pillarScore × pillarNominalWeight) / Σ available_pillar_weights\n\nFinal Published Score = round(fundScore × 0.90 + confidenceScore × 0.10)\n\nThe 10% confidence discount prevents short-history funds from ranking\nhigh just because they happened to launch in a bull market.`}
                  />
                </div>
              </Card>
            </Section>

            {/* 11. Confidence */}
            <Section id="confidence" icon={Shield} title="11. Confidence Score" subtitle="Penalises short-history and data-sparse funds">
              <Card>
                <Formula
                  label="Confidence Score (0–100)"
                  expr={`Age component (70% of confidence):\n  historyYears ≥ 10 → 100\n  historyYears ≥  7 →  90\n  historyYears ≥  5 →  75\n  historyYears ≥  3 →  60\n  else               →  40\n\nCompleteness component (30% of confidence):\n  12 key metrics checked: [cagr3y, sharpe, sortino, maxDrawdown, stdDev,\n  consistencyBeatRate, informationRatio, downsideCapture, jensensAlpha,\n  calmarRatio, omegaRatio, bearMarketReturn]\n\n  available / 12 > 0.95 → 100\n  available / 12 > 0.90 →  80\n  available / 12 > 0.80 →  60\n  else                  →  40\n\nconfidenceScore = round(ageComponent × 0.70 + completenessComponent × 0.30)`}
                />
              </Card>
            </Section>

            {/* 12. Explore Score */}
            <Section id="explore-score" icon={BarChart2} title="12. Explore Score" subtitle="Ratio-based quality score · 7 components · category-relative percentile">
              <Card>
                <div className="space-y-3">
                  <p className="font-mono text-[10px] text-muted-foreground">Each component is percentile-ranked within the category peer group (same method as Engine Score).</p>
                  <div className="space-y-1">
                    <WeightRow label="Sharpe Ratio" weight="20%" desc="Risk-adjusted return per unit of total volatility." />
                    <WeightRow label="Sortino Ratio" weight="15%" desc="Risk-adjusted return per unit of downside volatility only." />
                    <WeightRow label="Jensen's Alpha" weight="15%" desc="Beta-adjusted outperformance. Positive = fund adds value above market risk." />
                    <WeightRow label="Information Ratio" weight="15%" desc="Annualised alpha / tracking error. Consistency of outperformance." />
                    <WeightRow label="Risk-Adj Return" weight="15%" desc="AnnualReturnAvg / StdDev. Return per unit of observed volatility." />
                    <WeightRow label="Upside Capture" weight="10%" desc="% of benchmark upside captured. Higher = better." />
                    <WeightRow label="Downside Capture" weight="10%" desc="% of benchmark downside captured. Lower = better." />
                  </div>
                  <Formula
                    label="Explore Score"
                    expr={`exploreScore = Σ (percentile(component) × weight) / Σ available_weights\n\nMinimum: Sharpe (20%) must be available to produce a score.\nResult: 0–100, category-relative.`}
                  />
                </div>
              </Card>
            </Section>

            {/* 13. Return Score */}
            <Section id="return-score" icon={TrendingUp} title="13. Return Score" subtitle="Short-term + long-term trailing return composite · peer-relative">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Short-Term Score (weight = 30%)"
                    expr={`stScore = mean_percentile(\n  1W return  (25%),\n  1M return  (25%),\n  3M return  (25%),\n  6M return  (25%)\n)`}
                  />
                  <Formula
                    label="Long-Term Score (weight = 70%)"
                    expr={`ltScore = mean_percentile(\n  1Y CAGR (15%),\n  3Y CAGR (25%),\n  5Y CAGR (30%),\n  7Y CAGR (30%)\n)`}
                    notes="10Y CAGR is excluded from scoring (too few funds have 10Y history) but shown in the Returns table."
                  />
                  <Formula
                    label="Return Score"
                    expr={`returnScore = stScore × 0.30 + ltScore × 0.70\n\n(Weighted average of only available components)`}
                    notes="If a period's CAGR is unavailable (insufficient history), that sub-weight is redistributed to available periods."
                  />
                </div>
              </Card>
            </Section>

            {/* 14. Ranking Score */}
            <Section id="ranking-score" icon={Trophy} title="14. Ranking Score (Composite)" subtitle="Primary sort key on the Rankings page">
              <Card accent>
                <Formula
                  label="Ranking Score"
                  expr={`rankingScore = engineFinalScore × 0.50\n             + returnScore       × 0.30\n             + exploreScore      × 0.20\n\nWeighting rationale:\n  50% Engine  — fundamental quality across 7 pillars (most comprehensive)\n  30% Return  — investors care primarily about actual performance\n  20% Explore — additional ratio-quality signal, avoids double-counting\n\nIf a component is null, available weights are normalised to sum to 1.\nEngine Score is mandatory — funds without it receive null Ranking Score.`}
                />
              </Card>
            </Section>

            {/* 15. Limitations */}
            <Section id="limitations" icon={Info} title="15. Known Limitations & Honest Gaps" subtitle="What QuantFund cannot currently compute">
              <Card>
                <div className="space-y-3">
                  <Callout type="warn">
                    <strong>Fund Size (AUM)</strong>: Not available from mfapi.in or the public AMFI NAVAll.txt.
                    Requires AMC-level data or a paid data vendor (e.g., PrimeInvestor, MorningStar India). Shown as "—".
                  </Callout>
                  <Callout type="warn">
                    <strong>Expense Ratio (TER)</strong>: Not in public API. SEBI mandates monthly disclosure on AMC websites
                    but no aggregated free API exists. Shown as "—".
                  </Callout>
                  <Callout type="warn">
                    <strong>Holdings & Sector Exposure</strong>: Fund portfolio holdings are not in the mfapi.in response.
                    Would require scraping individual AMC factsheets.
                  </Callout>
                  <Callout type="warn">
                    <strong>Fund Manager Tenure</strong>: Not programmatically accessible from any free public API.
                  </Callout>
                  <Callout type="info">
                    <strong>Risk-Free Rate</strong>: Hardcoded at {RISK_FREE_RATE_ANNUAL * 100}% (Jun 2025 91-day T-Bill).
                    Sharpe/Sortino ratios computed using this rate may differ slightly from other platforms using different RFR values or dates.
                  </Callout>
                  <Callout type="info">
                    <strong>Benchmark</strong>: Category equal-weighted peer average (computed from peer NAVs) — not the official AMFI/SEBI designated benchmark
                    (e.g., Nifty 50, Nifty 500) which requires separate index data. Beta and capture ratios are relative to this category average, not market indices.
                  </Callout>
                </div>
              </Card>
            </Section>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
