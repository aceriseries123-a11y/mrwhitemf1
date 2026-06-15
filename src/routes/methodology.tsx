/**
 * methodology.tsx — Full Transparency & Calculation Reference
 *
 * Every formula, every weight, every data source — shown per-page context.
 * Users can open this page from any trust doubt and verify the exact math
 * behind any number shown anywhere on QuantFund.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Database, TrendingUp, Shield, Zap, BarChart2, Trophy, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RISK_FREE_RATE_ANNUAL, RISK_FREE_RATE_LABEL, RISK_FREE_RATE_SOURCE_URL, TRADING_DAYS_PER_YEAR } from "@/lib/risk-free-rate";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — QuantFund" },
      { name: "description", content: "Full transparency: every formula, weight, and data source behind every QuantFund number." },
    ],
  }),
  component: MethodologyPage,
});

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Section({ id, title, tag, children }: {
  id: string; title: string; tag?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        {tag && (
          <span className="rounded-md bg-cyan/10 border border-cyan/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan font-bold">
            {tag}
          </span>
        )}
        <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({ children, accent, warn }: { children: React.ReactNode; accent?: boolean; warn?: boolean }) {
  const cls = accent ? "border-cyan/30 bg-cyan/5" : warn ? "border-warning/30 bg-warning/5" : "border-border bg-surface";
  return <div className={`rounded-xl border p-5 ${cls}`}>{children}</div>;
}

function Formula({ label, expr, notes }: { label: string; expr: string; notes?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-cyan font-bold">{label}</p>
      <pre className="overflow-x-auto font-mono text-[11px] font-semibold text-foreground leading-relaxed whitespace-pre-wrap">{expr}</pre>
      {notes && <p className="mt-3 font-mono text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-2">{notes}</p>}
    </div>
  );
}

function Row({ label, weight, desc, source }: { label: string; weight: string; desc: string; source?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="w-14 shrink-0 rounded bg-cyan/10 px-2 py-0.5 text-center font-mono text-[10px] font-bold text-cyan">{weight}</span>
      <div className="flex-1">
        <p className="font-mono text-[11px] font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{desc}</p>
        {source && <p className="mt-0.5 font-mono text-[9px] text-cyan/70">Source: {source}</p>}
      </div>
    </div>
  );
}

function Note({ type, children }: { type: "info" | "warn" | "ok" | "verify"; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    info:   "border-cyan/30 bg-cyan/5 text-cyan",
    warn:   "border-warning/30 bg-warning/5 text-warning",
    ok:     "border-positive/30 bg-positive/5 text-positive",
    verify: "border-purple-500/30 bg-purple-500/5 text-purple-400",
  };
  const icons: Record<string, React.ReactNode> = {
    info:   <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
    warn:   <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
    ok:     <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
    verify: <Database className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${styles[type]}`}>
      {icons[type]}
      <p className="font-mono text-[10px] leading-relaxed">{children}</p>
    </div>
  );
}

// ─── Table of Contents ────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: "data-sources",     label: "1. Data Sources" },
  { id: "eligibility",      label: "2. Eligibility Rules" },
  { id: "fund-score",       label: "3. Fund Score" },
  { id: "confidence-score", label: "   • Confidence Score" },
  { id: "rating-bands",     label: "   • Rating Bands" },
  { id: "dashboard",        label: "4. Dashboard Page" },
  { id: "annual-return",    label: "   • Avg Cal-Yr Return" },
  { id: "rolling-1y-avg",   label: "   • Rolling 1Y Avg" },
  { id: "explorer",         label: "5. Explorer Page" },
  { id: "capture-ratios",   label: "   • Capture Ratios" },
  { id: "ratio-metrics",    label: "   • Ratio Metrics" },
  { id: "explore-score",    label: "   • Explore Score" },
  { id: "rankings",         label: "6. Rankings Page" },
  { id: "returns",          label: "7. Returns Page" },
  { id: "screener",         label: "8. Screener Page" },
  { id: "risk-metrics",     label: "9. Risk Formulas" },
  { id: "benchmark",        label: "10. Benchmark" },
  { id: "limitations",      label: "11. Known Gaps" },
  { id: "verify",           label: "12. How to Verify" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

function MethodologyPage() {
  return (
    <AppShell title="Methodology">
      <div className="mx-auto max-w-[1140px] space-y-4 pb-24">

        {/* Hero */}
        <div className="rounded-xl border border-cyan/40 bg-cyan/5 px-6 py-5">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6 text-cyan" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Methodology & Full Transparency</h1>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground max-w-3xl">
            Every number on QuantFund is computed in real-time from NAV data fetched live from <span className="text-foreground font-bold">mfapi.in → AMFI India</span>.
            No mock data. No imputed values. No random numbers. If a metric cannot be honestly computed (too little history, no benchmark peers, etc.), we show
            <span className="text-foreground font-bold"> "—"</span> instead of fabricating a value.
            This page explains exactly how every number you see is computed — formula by formula, page by page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["100% real NAV data", "No mock values", "Open formulas", "Peer-relative scoring"].map(t => (
              <span key={t} className="rounded-md border border-positive/30 bg-positive/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-positive">{t}</span>
            ))}
            <span className="rounded-md border border-cyan/30 bg-cyan/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan">
              RFR: {RISK_FREE_RATE_LABEL}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[190px_1fr]">

          {/* TOC */}
          <div className="hidden lg:block">
            <div className="sticky top-20 rounded-xl border border-border bg-surface p-3 space-y-0.5">
              <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border mb-2">Contents</p>
              {TOC_ITEMS.map(t => (
                <a key={t.id} href={`#${t.id}`}
                  className="block rounded px-2 py-1 font-mono text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  {t.label}
                </a>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-12">

            {/* ── 1. DATA SOURCES ────────────────────────────────────────── */}
            <Section id="data-sources" title="1. Data Sources" tag="All Pages">
              <Card>
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-[10px] font-bold text-cyan mb-1">Fund Universe List — AMFI India</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      URL: <code className="text-foreground">https://www.amfiindia.com/spages/NAVAll.txt</code><br/>
                      Contains: Scheme Code, Name, ISIN, NAV (today), Date, AMC, Category.<br/>
                      Filtered to <span className="text-foreground font-semibold">Direct Growth</span> plans only — removes regular plans (which have distributor commission drag) and dividend plans (which have inconsistent NAV growth due to payouts).
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold text-cyan mb-1">Historical NAV Series — mfapi.in</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      URL: <code className="text-foreground">https://api.mfapi.in/mf/{"{schemeCode}"}</code><br/>
                      Returns: complete daily NAV history since inception in DD-MM-YYYY format, newest first.<br/>
                      Contains ONLY: <code className="text-foreground">date</code>, <code className="text-foreground">nav</code>. No AUM, no expense ratio, no holdings.<br/>
                      We reverse the list to chronological (oldest first) and validate: nav must be finite and &gt; 0.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold text-cyan mb-1">Risk-Free Rate — RBI 91-day G-Sec T-Bill</p>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      Value: <span className="text-foreground font-semibold">{(RISK_FREE_RATE_ANNUAL * 100).toFixed(2)}% per annum</span><br/>
                      Source: <a href={RISK_FREE_RATE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-cyan underline">{RISK_FREE_RATE_SOURCE_URL}</a><br/>
                      Used for: Sharpe, Sortino, Jensen's Alpha, Omega Ratio calculations.<br/>
                      Daily equivalent: {(RISK_FREE_RATE_ANNUAL * 100).toFixed(2)}% ÷ {TRADING_DAYS_PER_YEAR} trading days = {(RISK_FREE_RATE_ANNUAL / TRADING_DAYS_PER_YEAR * 10000).toFixed(4)} bps/day
                    </p>
                  </div>
                  <Note type="warn">
                    AUM (Fund Size) and Expense Ratio (TER) are NOT in the public mfapi.in or AMFI NAVAll.txt feed. Shown as "—" everywhere. AMC-level data or a paid vendor is needed.
                  </Note>
                </div>
              </Card>
            </Section>

            {/* ── 2. ELIGIBILITY ─────────────────────────────────────────── */}
            <Section id="eligibility" title="2. Eligibility Rules" tag="All Funds">
              <Card>
                <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  Before a fund receives a Fund Score or Confidence Score, it must pass three checks.
                  Funds that fail any check are shown as <span className="text-foreground font-semibold">"Not Ranked — Eligibility Not Met"</span> on their fund page instead of a score.
                </p>
                <div className="space-y-1">
                  <Row label="Minimum 5-Year History" weight="Gate" desc="historyYears ≥ 5. Computed from (lastNAVdate − firstNAVdate) / 365 days. Funds younger than 5 years are not ranked, regardless of how strong their early returns look." source="mfapi.in NAV history" />
                  <Row label="Direct Plan Only" weight="Gate" desc="Scheme name must match /direct/i. Regular plans (with distributor commission drag) are excluded from all rankings and category peer sets." source="AMFI NAVAll.txt scheme name" />
                  <Row label="Sufficient Rolling-Return History" weight="Gate" desc="≥ 8 valid rolling 3-year windows must be computable (requires ≥ 0.85 × 3 years = 2.55 years between the earliest and latest usable window starts, i.e. comfortably more than the 5Y minimum once daily data density is accounted for)." source="mfapi.in NAV history" />
                </div>
                <Note type="info">
                  Eligibility is checked per fund, independently of category. A fund can be eligible in one check (e.g. 6 years of history) but still fail another (e.g. it's a Regular plan).
                </Note>
              </Card>
            </Section>

            {/* ── 3. FUND SCORE ──────────────────────────────────────────── */}
            <Section id="fund-score" title="3. Fund Score — Category-Based Methodology" tag="Core">
              <Card>
                <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  The Fund Score (0–100) is computed <span className="text-foreground font-semibold">separately for each mutual fund category</span> — Large Cap funds are ranked only against other Large Cap funds, Mid Cap against Mid Cap, and so on. Funds are <span className="text-foreground font-semibold">never compared across categories</span>.
                </p>
                <Formula
                  label="Step 1 — Percentile rank (how each metric is converted to 0–100)"
                  expr={`percentileRank(fund_value, all_peer_values) =\n  (count where peer < fund_value\n   + 0.5 × count where peer = fund_value)\n  / total_peers × 100\n\nFor LOWER-IS-BETTER metrics (Max Drawdown, Downside Capture, Tracking Error):\n  score = 100 − percentileRank\n\nIf a metric is null for a fund, or fewer than 2 peers have a value,\nthat metric is excluded and its weight is redistributed within its category.`}
                />
                <div className="mt-3 space-y-1">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-cyan font-bold mb-2">Category Weights (sum to 100%)</p>
                  <Row label="Risk" weight="30%" desc="Sharpe Ratio(8) + Sortino Ratio(8) + Maximum Drawdown(8, lower=better) + Downside Capture(6, lower=better)." source="mfapi.in NAV history + RBI RFR" />
                  <Row label="Performance" weight="25%" desc="3Y Mean Rolling Return(8) + 5Y Mean Rolling Return(12) + Median Rolling Return(5). NOT 1Y return, NOT YTD, NOT simple trailing-return ranking." source="mfapi.in NAV history" />
                  <Row label="Consistency" weight="20%" desc="Benchmark Outperformance Frequency(8) + Peer Outperformance Frequency(7) + Quartile Consistency(5)." source="mfapi.in NAV + category benchmark" />
                  <Row label="Benchmark Skill" weight="10%" desc="Information Ratio(6) + Alpha(4)." source="mfapi.in NAV + category benchmark" />
                  <Row label="Portfolio Quality" weight="10%" desc="Concentration(4) + Sector Concentration(3) + Turnover(3). Portfolio holdings data is not available from AMFI/mfapi.in." source="Not Available" />
                  <Row label="Manager Quality" weight="5%" desc="Manager Tenure(3) + Manager Stability(2). Manager-tenure data is not available from AMFI/mfapi.in." source="Not Available" />
                </div>
                <Note type="warn">
                  <strong>Portfolio Quality and Manager Quality are marked "Data Not Available"</strong>, not estimated or faked. Their combined 15% weight is redistributed <span className="text-foreground font-semibold">proportionally</span> across the four available categories (Risk, Performance, Consistency, Benchmark Skill), which together sum to 85% — each available category's effective weight is scaled by 100/85.
                </Note>
                <Formula
                  label="Step 2 — Category score → Fund Score"
                  expr={`For each available category C:\n  categoryScore(C) = Σ (metric_percentile × metric_weight) / Σ available metric_weights\n\nredistributionFactor = (Σ all category weights) / (Σ available category weights)\n                     = 100% / 85%   (when Portfolio Quality + Manager Quality unavailable)\n\nFund Score = round( Σ categoryScore(C) × categoryWeight(C) × redistributionFactor )\n\nRange: 0–100. Deterministic and reproducible — same NAV data always\nproduces the same Fund Score, with no randomness or hidden adjustments.`}
                  notes="Performance metrics use rolling-window means and medians (NOT simple trailing 1Y/YTD returns), per the methodology requirement that long-horizon consistency matters more than recent performance."
                />
              </Card>

              {/* Consistency detail */}
              <Card accent>
                <p className="font-mono text-[9px] uppercase tracking-widest text-cyan font-bold mb-2">Consistency Category — Detail</p>
                <div className="space-y-3">
                  <Formula
                    label="Benchmark Outperformance Frequency"
                    expr={`For each rolling 3-year window, compare fund return vs the category benchmark\n(equal-weighted average of all peer funds — see Section 10) over the same window.\n\nconsistencyBeatRate = (windows where fund > benchmark) / (total windows)\n\nResult is a fraction 0–1, converted to 0–100 before weighting.\nRequires ≥ 8 rolling windows.`}
                  />
                  <Formula
                    label="Peer Outperformance Frequency"
                    expr={`peerBeatRate = (peers whose 3Y mean rolling return this fund exceeds)\n             / (total peers with a valid 3Y mean rolling return) × 100\n\nAnswers: "What % of category peers does this fund's typical 3-year\nreturn outperform?"`}
                  />
                  <Formula
                    label="Quartile Consistency"
                    expr={`quartileConsistency = percentileRank(\n  fund.rollingReturn3yAvg,\n  peers[].rollingReturn3yAvg\n)\n\nMeasures whether the fund's typical 3-year return places it consistently\nin the upper half of its category's return distribution.`}
                  />
                </div>
              </Card>
            </Section>

            {/* ── CONFIDENCE SCORE ───────────────────────────────────────── */}
            <Section id="confidence-score" title="Confidence Score (0–100, Separate from Fund Score)" tag="Core">
              <Card>
                <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  The Confidence Score is <span className="text-foreground font-semibold">never combined with the Fund Score</span> — they are displayed side by side. It indicates how much statistical weight to give the Fund Score: a high Fund Score on a 5-year-old fund with sparse data deserves less confidence than the same score on a 15-year fund with complete data.
                </p>
                <Formula
                  label="Confidence Score formula"
                  expr={`Confidence Score = round(\n    ageScore              × 0.40   (Fund Age)\n  + completenessScore     × 0.30   (Data Completeness)\n  + managerStabilityScore × 0.15   (Manager Stability)\n  + aumStabilityScore     × 0.15   (AUM Stability)\n)\n\nageScore:\n  ≥10 years → 100   7-10 years → 85   5-7 years → 70\n  3-5 years → 50    < 3 years  → 30\n\ncompletenessScore = (count of 10 key metrics that are non-null / 10) × 100\n  Checked: Sharpe, Sortino, MaxDD, Downside Capture, 3Y/5Y Mean Rolling,\n  Median Rolling, Benchmark Beat Rate, Information Ratio, Alpha\n\nmanagerStabilityScore = 50  (neutral — manager-tenure data not available)\naumStabilityScore     = 50  (neutral — AUM-history data not available)`}
                  notes="Manager Stability and AUM Stability default to a neutral 50/100 because the underlying data is not available from AMFI/mfapi.in. This is disclosed rather than estimated, and is the reason these two factors cannot push the Confidence Score below 50 × 0.30 = 15 or above 50 × 0.30 = 15 on their own."
                />
              </Card>
            </Section>

            {/* ── RATING BANDS ───────────────────────────────────────────── */}
            <Section id="rating-bands" title="Rating Bands" tag="Display">
              <Card>
                <div className="space-y-1">
                  <Row label="Elite+" weight="95-100" desc="Top-tier across nearly every available category for its peer group." />
                  <Row label="Elite" weight="90-94" desc="Consistently strong across most categories." />
                  <Row label="Excellent" weight="80-89" desc="Above-average on most categories, few weaknesses." />
                  <Row label="Good" weight="70-79" desc="Solidly above the category median." />
                  <Row label="Average" weight="60-69" desc="Roughly in line with category peers." />
                  <Row label="Below Average" weight="50-59" desc="Trails the category median on most metrics." />
                  <Row label="Weak" weight="<50" desc="Underperforms most category peers across available metrics." />
                </div>
              </Card>
            </Section>

            {/* ── 4. DASHBOARD ───────────────────────────────────────────── */}
            <Section id="dashboard" title="4. Dashboard Page" tag="Dashboard">
              <Note type="info">
                Dashboard loads ALL Direct-Growth funds (~1,300+), fetches NAV history for each, and computes metrics in the background as data arrives. Scores update live as more data loads.
              </Note>

              {/* Annual Return Avg */}
              <div id="annual-return" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Column: "Avg Cal-Yr Ret" (Annual Return Average)</p>
                <Card accent>
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                    This is the <span className="text-foreground font-semibold">arithmetic mean of each complete calendar year's simple return</span>.
                    NOT a rolling average, NOT a CAGR. It answers: "On average, how much did this fund grow each year?"
                  </p>
                  <Formula
                    label="Step 1 — Calendar Year Return for year Y"
                    expr={`startNAV(Y) = first trading day NAV in year Y (e.g. Jan 2 or 3)\nendNAV(Y)   = last available NAV in year Y (e.g. Dec 29 or 30)\n\nyearReturn(Y) = endNAV(Y) / startNAV(Y) - 1\n\nYear Y is included only if:\n  • At least one NAV exists in year Y\n  • The end point falls in year Y (not spilled to next)\n  • Y < current calendar year (incomplete current year excluded)`}
                    notes="Uses the actual first and last available trading-day NAV in the calendar year. Since Jan 1 and Dec 31 are often holidays, we use the nearest real trading day."
                  />
                  <Formula
                    label="Step 2 — Average"
                    expr={`avgCalYrReturn = (yearReturn(Y1) + yearReturn(Y2) + ... + yearReturn(Yn)) / n\n\nExample — fund with 5 full calendar years of data:\n  2019: +14.2%  2020: -8.4%  2021: +32.1%  2022: -5.6%  2023: +18.7%\n  Average = (14.2 − 8.4 + 32.1 − 5.6 + 18.7) / 5 = +10.2%\n\nHover the cell on Dashboard to see each year's individual return.`}
                    notes="Arithmetic mean (not geometric/CAGR). Shows the average investor experience in any given year — including the bad years."
                  />
                  <Note type="verify">
                    To verify: open any fund's detail page, check the NAV on Jan 2 and Dec 30 for any year, compute (Dec30_NAV / Jan2_NAV - 1). Should match the per-year value in the tooltip.
                  </Note>
                </Card>
              </div>

              {/* Rolling 1Y Avg */}
              <div id="rolling-1y-avg" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Column: "Rolling 1Y Avg" (Mean of All Rolling 1-Year Returns)</p>
                <Card accent>
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                    This is the <span className="text-foreground font-semibold">average of every possible 1-year return</span> in the fund's history.
                    For each trading day, we compute "what would someone earn if they invested on this day and sold exactly 1 year later?"
                    Then average all such returns. Positive = on average, any 1-year investor made money.
                  </p>
                  <Formula
                    label="Rolling 1Y Avg calculation"
                    expr={`For each NAV point at date T (going backwards):\n  startPoint = navAtOrBefore(series, T − 365 days)\n  if not found → stop\n  if (T − startPoint.t) < 0.85 × 365 days → skip\n  windowReturn(T) = NAV(T) / NAV(startPoint) - 1\n\nrollingReturn1yAvg = mean of all valid windowReturns\n\nExample:\n  Fund has 1,200 trading days of history.\n  ~960 valid 1-year windows exist.\n  Sum of all 960 returns / 960 = "+11.3%"\n  → On average, any investor who held for 1 year earned +11.3%`}
                    notes="Requires ≥ 8 valid windows. Uses timestamp comparison (not array-index offsets) so weekend and holiday gaps don't distort the window size. This is different from the Avg Cal-Yr Ret which only counts full calendar years."
                  />
                  <Note type="ok">
                    Key difference: Calendar-year average counts only ~5-15 data points (one per year). Rolling 1Y average counts hundreds of data points — every trading day is a window endpoint. It's a much richer statistical picture of the fund's consistency.
                  </Note>
                </Card>
              </div>

              {/* Fund Score column reference */}
              <div id="dashboard-fund-score" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Column: "Fund Score"</p>
                <Card>
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    The Fund Score shown on this column is computed using the category-based methodology described in{" "}
                    <a href="#fund-score" className="text-cyan underline underline-offset-2">Section 3 — Fund Score</a>.
                    Each fund is scored against other Direct-Growth funds in the <span className="text-foreground font-semibold">same QuantFund category only</span> — Large Cap vs Large Cap, Mid Cap vs Mid Cap, and so on.
                  </p>
                  <Note type="verify">
                    To verify a fund's score: filter the Dashboard to a single category. The fund ranked last should have a Fund Score near 0, and the fund ranked first should be near 100 — Fund Score is a weighted blend of category-relative percentile ranks.
                  </Note>
                </Card>
              </div>
            </Section>

            {/* ── 5. EXPLORER ────────────────────────────────────────────── */}
            <Section id="explorer" title="5. Explorer Page" tag="Explorer">
              <Note type="info">
                Explorer reads from the same computed metrics that Dashboard produces. No additional API calls are made. All values come from the real NAV series stored after Dashboard scoring.
              </Note>

              {/* Capture Ratios */}
              <div id="capture-ratios" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Columns: "↑ Upside Cap %" and "↓ Downside Cap %"</p>
                <Card accent>
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">
                    Capture ratios measure how much of the benchmark's movement (up or down) the fund replicates.
                    The <span className="text-foreground font-semibold">benchmark</span> is the equal-weighted average of all peer funds in the same category — see Section 8.
                  </p>
                  <Formula
                    label="Monthly log return aggregation"
                    expr={`For each calendar month M:\n  fundMonthRet(M)  = Σ log(NAV_t / NAV_{t-1}) for all t in month M (fund)\n  benchMonthRet(M) = Σ log(bm_t  / bm_{t-1})  for all t in month M (benchmark)\n\nUp months   = months where benchMonthRet > 0\nDown months = months where benchMonthRet < 0`}
                  />
                  <Formula
                    label="Upside Capture Ratio"
                    expr={`UpsideCapture = (Σ fundRet over UP months / Σ benchRet over UP months) × 100\n\nRequires ≥ 6 up months. Result in %.\n\nExamples:\n  105% → fund captured 105% of benchmark gains on rising months (green, ≥ 100%)\n   90% → fund captured only 90% of benchmark gains (yellow, 85–100%)\n   70% → fund significantly lagged on rally months (red, < 85%)\n\nHigher = better. Green shown for ≥ 100%, yellow 85-100%, red < 85%.`}
                    notes="Shown as '+X.X%' to indicate it is a positive gain fraction. The '+' sign is a display convention, not a mathematical plus."
                  />
                  <Formula
                    label="Downside Capture Ratio"
                    expr={`DownsideCapture = (Σ fundRet over DOWN months / Σ benchRet over DOWN months) × 100\n\nRequires ≥ 6 down months. Result in %.\n\nExamples:\n   75% → fund fell only 75% as much as benchmark (green, ≤ 80%)\n   90% → fund fell slightly less than benchmark (yellow, 80-100%)\n  110% → fund fell MORE than benchmark (red, > 100%)\n\nLower = better. Green for ≤ 80%, yellow 80-100%, red > 100%.`}
                    notes="Both capture ratios use the EQUAL-WEIGHTED PEER AVERAGE as benchmark, not Nifty 50 or any market index. See Section 8."
                  />
                  <Note type="verify">
                    To verify manually: pick a fund and its category peer set. Find months where the peer average was negative. Compare fund's monthly return / peer average monthly return. The ratio × 100 = downside capture %.
                  </Note>
                </Card>
              </div>

              {/* Ratio Metrics */}
              <div id="ratio-metrics" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Columns: Beta · StdDev · Sharpe · Sortino · Jensen's Alpha · Info Ratio</p>
                <Card>
                  <div className="space-y-3">
                    <Formula
                      label="Beta — market sensitivity"
                      expr={`Aligned daily log return pairs (fund, benchmark) for overlapping dates:\n  f_t = log(NAV_fund(t) / NAV_fund(t-1))\n  b_t = log(bm(t) / bm(t-1))\n\nβ = Cov(f, b) / Var(b)\n  = Σ((f_t − f̄)(b_t − b̄)) / Σ((b_t − b̄)²)\n\nRequires ≥ 60 paired data points.\nβ = 1.0 → fund mirrors benchmark exactly\nβ > 1.0 → amplifies benchmark swings (higher risk)\nβ < 1.0 → less sensitive (lower systematic risk)`}
                    />
                    <Formula
                      label="Standard Deviation (Annualised Volatility)"
                      expr={`Daily log returns: r_t = log(NAV_t / NAV_{t-1})\n\nσ_annual = sqrt(sample_variance(r) × ${TRADING_DAYS_PER_YEAR})\n         = sqrt(Σ(r_t − mean)² / (n−1) × ${TRADING_DAYS_PER_YEAR})\n\nRequires ≥ 30 log returns. Uses last 3×252 = 756 data points maximum.`}
                    />
                    <Formula
                      label="Sharpe Ratio"
                      expr={`R = 3Y CAGR (falls back to 1Y if no 3Y)\nRFR = ${RISK_FREE_RATE_ANNUAL * 100}% per annum\n\nSharpe = (R − RFR) / σ_annual\n\n> 2.0 = excellent · > 1.0 = good · 0-1 = acceptable · < 0 = bad`}
                    />
                    <Formula
                      label="Sortino Ratio"
                      expr={`σ_downside = sqrt(Σ min(0, r_t)² / n × ${TRADING_DAYS_PER_YEAR})\n           (only negative daily returns contribute)\n\nSortino = (R − RFR) / σ_downside\n\nBetter than Sharpe for skewed returns — does not penalise upside volatility.`}
                    />
                    <Formula
                      label="Jensen's Alpha"
                      expr={`α = R_fund − (RFR + β × (R_bench − RFR))\n\nWhere all rates are 3Y CAGR:\n  R_fund  = 3Y CAGR of the fund\n  R_bench = 3Y CAGR of the equal-weighted peer benchmark\n  β       = Beta computed above\n  RFR     = ${RISK_FREE_RATE_ANNUAL * 100}% p.a.\n\nPositive α → fund generated excess return after adjusting for market risk\nNegative α → fund underperformed on a risk-adjusted basis`}
                    />
                    <Formula
                      label="Information Ratio"
                      expr={`excess_return(t) = f_t − b_t  (daily log return difference)\n\nTracking Error (TE) = sqrt(Var(excess_return) × ${TRADING_DAYS_PER_YEAR})\n\nIR = (mean(excess_return) × ${TRADING_DAYS_PER_YEAR}) / TE\n   = annualised_alpha / tracking_error\n\n> 0.5 = good alpha consistency · > 1.0 = excellent`}
                    />
                  </div>
                </Card>
              </div>

              {/* Explore Score */}
              <div id="explore-score" className="scroll-mt-20 space-y-3">
                <p className="font-mono text-[10px] font-bold text-foreground border-l-2 border-cyan pl-3">Column: "Explore Score" (0–100, category-relative)</p>
                <Card>
                  <p className="font-mono text-[10px] text-muted-foreground mb-3">
                    7-component ratio quality score. Each component is percentile-ranked within category peers before weighting.
                  </p>
                  <div className="space-y-1 mb-3">
                    <Row label="Sharpe Ratio" weight="20%" desc="Risk-adjusted return per unit of total volatility (daily log returns)." />
                    <Row label="Sortino Ratio" weight="15%" desc="Risk-adjusted return per unit of downside volatility only." />
                    <Row label="Jensen's Alpha" weight="15%" desc="Beta-adjusted outperformance vs peer benchmark." />
                    <Row label="Information Ratio" weight="15%" desc="Alpha per unit of tracking error — consistency of outperformance." />
                    <Row label="Risk-Adj Return" weight="15%" desc="avgCalYrReturn / stdDev — raw return per unit of volatility." />
                    <Row label="Upside Capture" weight="10%" desc="How much of the benchmark upside the fund captured (higher = better)." />
                    <Row label="Downside Capture" weight="10%" desc="How much downside captured vs benchmark (lower = better)." />
                  </div>
                  <Formula
                    label="Explore Score"
                    expr={`exploreScore = Σ(percentileRank(component) × weight) / Σ(available weights)\n\nMinimum: Sharpe Ratio (20%) must be non-null to produce a score.\nIf a component is null → its weight redistributed to other available components.`}
                  />
                </Card>
              </div>
            </Section>

            {/* ── 4. RANKINGS ────────────────────────────────────────────── */}
            <Section id="rankings" title="6. Rankings Page" tag="Rankings">
              <Card>
                <Formula
                  label="Ranking Score — primary sort on Rankings page"
                  expr={`rankingScore = Fund Score × 0.50\n             + Return Score  × 0.30\n             + Explore Score × 0.20\n\nReturn Score = ShortTerm × 0.30 + LongTerm × 0.70\n  ShortTerm = mean_percentile(1D×20%, 1W×20%, 1M×20%, 3M×20%, 6M×20%)\n  LongTerm  = mean_percentile(Rolling1Y×25%, Rolling3Y×25%, Rolling5Y×25%, Rolling7Y×25%)\n\nAll sub-scores are 0–100, category-relative percentile ranks.\n\nWeighting rationale:\n  50% Fund Score — the category-based methodology (Risk, Performance, Consistency, Benchmark Skill)\n  30% Return     — actual performance is what investors care about most\n  20% Explore    — additional ratio quality, prevents gaming with 2 metrics\n\nFund Score is mandatory — null Fund Score → null Ranking Score.`}
                />
                <Note type="info">Rankings also shows the Fund Score's category breakdown (Risk, Performance, Consistency, Benchmark Skill, Portfolio Quality, Manager Quality) so you can see why a fund ranks where it does — see Section 3.</Note>
              </Card>
            </Section>

            {/* ── 5. RETURNS ─────────────────────────────────────────────── */}
            <Section id="returns" title="7. Returns Page" tag="Returns Historical">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Trailing Return — periods < 1 year (1W, 1M, 3M, 6M)"
                    expr={`simpleReturn = NAV_end / NAV_start − 1\n\n  NAV_end   = latest NAV (most recent trading day)\n  NAV_start = navAtOrBefore(series, end_t − period_ms)\n\nPeriod durations:\n  1W = 7/365 years   1M = 1/12 years\n  3M = 3/12 years    6M = 6/12 years`}
                  />
                  <Formula
                    label="CAGR — periods ≥ 1 year (1Y, 3Y, 5Y, 7Y, 10Y)"
                    expr={`CAGR = (NAV_end / NAV_start)^(1 / actual_years) − 1\n\n  actual_years = (end_t − start_t) / YEAR_MS   where YEAR_MS = 365 × 86400000 ms\n\nQuality gate: actual_years ≥ 0.85 × requested_years\n  3Y CAGR requires ≥ 2.55 years of real data; if less → shown as "—"`}
                    notes="Both start and end points are the nearest available real trading-day NAV. No interpolation."
                  />
                  <Note type="ok">All trailing return periods start from the SAME endpoint: the most recent available NAV date. So 3Y CAGR and 5Y CAGR both end on the same day, allowing fair comparison between periods.</Note>
                </div>
              </Card>
            </Section>

            {/* ── 6. SCREENER ────────────────────────────────────────────── */}
            <Section id="screener" title="8. Screener Page" tag="Screener">
              <Card>
                <p className="font-mono text-[10px] text-muted-foreground leading-relaxed mb-3">
                  All 15 screener filters operate on the same <code className="text-foreground">EngineMetrics</code> values computed in the Dashboard.
                  No new calculations are done. Filters are exact comparisons against real computed values:
                </p>
                <div className="space-y-1">
                  <Row label="Min Fund Score" weight="0–100" desc="fund.fundScore ≥ filter value" />
                  <Row label="Min 3Y CAGR" weight="%" desc="metrics.cagr3y × 100 ≥ filter value" />
                  <Row label="Max Drawdown ≥" weight="%" desc="metrics.maxDrawdown × 100 ≥ filter value (e.g., −30% means allow up to −30% drawdown)" />
                  <Row label="Min Sharpe" weight="" desc="metrics.sharpe ≥ filter value" />
                  <Row label="Min Sortino" weight="" desc="metrics.sortino ≥ filter value" />
                  <Row label="Min Rolling 1Y+" weight="%" desc="metrics.rollingPos1y × 100 ≥ filter value (% of 1Y windows positive)" />
                  <Row label="Max Beta" weight="" desc="metrics.beta ≤ filter value" />
                  <Row label="Max Std Dev" weight="%" desc="metrics.stdDev × 100 ≤ filter value" />
                  <Row label="Min History" weight="yrs" desc="metrics.historyYears ≥ filter value" />
                  <Row label="Min Alpha" weight="%" desc="metrics.jensensAlpha × 100 ≥ filter value" />
                  <Row label="Min Info Ratio" weight="" desc="metrics.informationRatio ≥ filter value" />
                  <Row label="Min Upside Cap" weight="%" desc="metrics.upsideCapture ≥ filter value" />
                  <Row label="Max Downside Cap" weight="%" desc="metrics.downsideCapture ≤ filter value" />
                  <Row label="Min Omega" weight="" desc="metrics.omegaRatio ≥ filter value" />
                  <Row label="Min Calmar" weight="" desc="metrics.calmarRatio ≥ filter value" />
                </div>
              </Card>
            </Section>

            {/* ── 7. RISK FORMULAS ───────────────────────────────────────── */}
            <Section id="risk-metrics" title="9. Complete Risk Metric Formulas" tag="All Pages">
              <Card>
                <div className="space-y-3">
                  <Formula
                    label="Maximum Drawdown"
                    expr={`peak(T) = max(NAV(s)) for all s ≤ T\n\nMaxDD = min over all T of:\n  (NAV(T) − peak(T)) / peak(T)\n\nRange: [−1, 0]. Example: −0.35 = worst peak-to-trough loss was 35%.\nComputed over FULL history (not just recent 3Y).`}
                  />
                  <Formula
                    label="Calmar Ratio"
                    expr={`Calmar = 3Y_CAGR / |MaxDrawdown|\n\nExample: 3Y CAGR = 15%, MaxDD = −25% → Calmar = 0.15 / 0.25 = 0.60\nHigher = more compounded return per unit of worst-case loss.\nNull if MaxDD = 0 or fund has < 3Y history.`}
                  />
                  <Formula
                    label="Omega Ratio"
                    expr={`dailyRFR = ${RISK_FREE_RATE_ANNUAL}/${TRADING_DAYS_PER_YEAR} = ${(RISK_FREE_RATE_ANNUAL/TRADING_DAYS_PER_YEAR).toFixed(6)}\n\nOmega = Σ max(0, r_t − dailyRFR)  /  Σ max(0, dailyRFR − r_t)\n      = sum of daily gains above RFR / sum of daily shortfalls below RFR\n\nHigher = more return per unit of shortfall risk.\nRequires ≥ 60 log returns. Null if denominator = 0.`}
                  />
                  <Formula
                    label="Bear Market Return"
                    expr={`Bear months = months where benchMonthRet < 0 (same as downside capture months)\n\nbearMarketReturn = (Σ fund_log_ret over bear months / count) × 12\n                = annualised average monthly return during benchmark down-months\n\nHigher (less negative) = fund preserves more capital in bear markets.`}
                  />
                </div>
              </Card>
            </Section>

            {/* ── 8. BENCHMARK ───────────────────────────────────────────── */}
            <Section id="benchmark" title="10. Category Benchmark Construction" tag="Benchmark">
              <Card>
                <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  QuantFund does NOT use Nifty 50, Sensex, or any external market index as benchmark.
                  Instead, it builds an <span className="text-foreground font-semibold">equal-weighted average of all peer funds in the same category</span>.
                  This makes every metric (Beta, Capture, IR, Alpha) <span className="text-foreground font-semibold">category-relative</span> — a Large Cap fund's Alpha is relative to other Large Cap funds, not to a mid-cap index.
                </p>
                <Formula
                  label="Benchmark construction"
                  expr={`For each fund F in the category, normalize its NAV series:\n  normNAV(F, t) = (NAV(F, t) / NAV(F, inception)) × 100\n  (Every fund starts at 100 on its first trading day)\n\nFor each calendar date D:\n  benchmark(D) = mean(normNAV(F, D) for all F with data on D)\n\nRequirements:\n  • ≥ 5 peer funds in category (otherwise benchmark = null)\n  • Each date needs ≥ max(3, 30% of peers) funds reporting that day\n  • ≥ 100 valid dates → benchmark is usable\n\nFunds with insufficient peers: all benchmark-relative metrics → null ("—")`}
                  notes="Normalizing to 100 removes the effect of different starting NAV prices, so a fund with NAV ₹10 and one with NAV ₹5000 both contribute equally."
                />
                <Note type="warn">
                  This category benchmark is NOT the official SEBI/AMFI designated benchmark. Beta and capture ratios vs this benchmark will differ from ratios published on AMC factsheets (which use Nifty 50 or other official indices).
                </Note>
              </Card>
            </Section>

            {/* ── 9. LIMITATIONS ─────────────────────────────────────────── */}
            <Section id="limitations" title="11. Known Limitations & Honest Gaps" tag="Trust">
              <div className="space-y-3">
                <Note type="warn">
                  <strong>Portfolio Quality (10% weight) & Manager Quality (5% weight)</strong>: Portfolio concentration, sector concentration, turnover, manager tenure, and manager stability are not available from AMFI/mfapi.in. Both categories are marked "Data Not Available" on every fund page; their combined 15% weight is redistributed proportionally across Risk, Performance, Consistency, and Benchmark Skill — never estimated or faked.
                </Note>
                <Note type="warn">
                  <strong>Fund Size (AUM)</strong>: Not available in public mfapi.in or AMFI NAVAll.txt. Requires AMC-level scraping or a paid vendor. Shows "—" everywhere.
                </Note>
                <Note type="warn">
                  <strong>Expense Ratio (TER)</strong>: Not in public API. SEBI mandates monthly disclosure on AMC websites but there is no free aggregated API. Shows "—" everywhere.
                </Note>
                <Note type="warn">
                  <strong>Holdings & Sector Allocation</strong>: Not in mfapi.in response. Requires scraping individual AMC monthly factsheets.
                </Note>
                <Note type="warn">
                  <strong>Category Benchmark vs Market Index</strong>: All benchmark-relative metrics (Beta, Capture, Alpha, IR) use the equal-weighted peer average, NOT Nifty 50 or any official index. Values will differ from AMC factsheets.
                </Note>
                <Note type="info">
                  <strong>Risk-Free Rate</strong>: Hardcoded at {RISK_FREE_RATE_ANNUAL * 100}% (91-day T-Bill, Jun 2025). Sharpe/Sortino may differ from platforms using different RFR or dates. Source linked above.
                </Note>
                <Note type="info">
                  <strong>Fund Manager Tenure</strong>: Not available from any free public API. Not shown.
                </Note>
              </div>
            </Section>

            {/* ── 10. HOW TO VERIFY ──────────────────────────────────────── */}
            <Section id="verify" title="12. How to Verify Any Number" tag="Trust">
              <Card accent>
                <div className="space-y-4">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    You don't have to trust us. Here's how to independently verify every major metric:
                  </p>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify NAV data</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Open <code>https://api.mfapi.in/mf/{"<scheme_code>"}</code> directly in browser. The "data" array contains every NAV date and value — same data QuantFund uses.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify 3Y CAGR</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        From API: find NAV ~3 years ago (date closest to today − 3 years). Latest NAV ÷ that NAV, raised to power (1/3), minus 1 = CAGR. Should match within rounding.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify Avg Cal-Yr Return</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        From API: for each full calendar year, take (last_NAV_of_year / first_NAV_of_year − 1). Average all years. Should match the "Avg Cal-Yr Ret" column (hover for per-year values).
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify Rolling 1Y Avg</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Sample 100 random dates in the fund's history. For each, find the NAV 1 year before. Compute return. Average all ~100 samples — should be close to Rolling 1Y Avg shown.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify Score is category-relative</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Filter Dashboard to any single category (e.g., "Large Cap"). The fund ranked last should have a Fund Score ≈ 0–10. The fund ranked first should have ≈ 90–100. Fund Score = weighted blend of category-relative percentile ranks, as described in Section 3.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
                      <p className="font-mono text-[10px] font-bold text-foreground">Verify Sharpe Ratio</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        (3Y CAGR − {RISK_FREE_RATE_ANNUAL * 100}%) ÷ annualised std dev. For std dev: take log(NAV_t/NAV_{'t-1'}) for each day, compute std dev of those values, multiply by √{TRADING_DAYS_PER_YEAR}.
                      </p>
                    </div>
                  </div>
                  <Note type="ok">
                    All source code logic is deterministic and pure — same NAV data will always produce the same score. There is no randomness, no A/B weighting, no hidden adjustments.
                  </Note>
                </div>
              </Card>
            </Section>

            {/* Back links */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
              {[
                { to: "/dashboard",          label: "Dashboard" },
                { to: "/explorer",           label: "Explorer" },
                { to: "/rankings",           label: "Rankings" },
                { to: "/returns-historical", label: "Returns" },
                { to: "/screener",           label: "Screener" },
              ].map(({ to, label }) => (
                <Link key={to} to={to}
                  className="rounded-lg border border-border bg-surface px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-cyan/40 hover:text-foreground">
                  ← {label}
                </Link>
              ))}
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
