
## Goal

Every page shows either verified real data or a clear "Sample/Demo" label. No fabricated scheme codes, no random metrics, no stale hardcoded index values.

## What's wrong today (audit findings)

**Fabricated data sources:**
- `src/lib/synthetic-metrics.ts` — generates Sharpe/Sortino/Alpha/CAGR/AUM/expense from a hash of the scheme code. Used by Dashboard rankings and (formerly) Explorer scores.
- Index ticker on Home/Dashboard — hardcoded NIFTY/BankNifty/Gold/USDINR/VIX values that disagree across pages; all show "+0.00%".
- `src/lib/scoring.ts` — the "QuantFund Score" is a deterministic hash, not derived from returns.
- Marketing copy "4,128 schemes · 20Y NAV history" on the landing page is asserted, not measured.

**Pages affected:** Home, Dashboard, Explorer, Compare, Portfolio, Screener, Backtest, Rankings, Research Desk, Fund detail, Settings.

## Plan

### 1. Kill the synthetic engine
- Delete `src/lib/synthetic-metrics.ts` and all imports.
- Replace `src/lib/scoring.ts` with a pure NAV-history scorer (see §3) — same export signature so callers don't break.
- Anywhere a page still needs a metric we can't compute yet (AUM, expense ratio, alpha vs benchmark on the universe scale), render `—` with a tooltip "Not available from AMFI feed".

### 2. Live index ticker (real API)
- Add `src/routes/api/public/market-indices.ts` — edge-proxied, 60s cache, fetches NIFTY 50, Bank Nifty, Nifty Midcap 150, India VIX, USD/INR, Gold, 10Y G-Sec from the user-provided API.
- Requires secret `MARKET_DATA_API_KEY`. Provider TBD (TwelveData supports all these symbols and has a free tier with key — I'll request it once plan is approved).
- Single `useMarketIndices()` hook consumed by Home + Dashboard so values are always identical.
- Each tile shows last-updated timestamp + source attribution ("Source: TwelveData · 14:32 IST").
- Hard failure → tile shows "Unavailable" not zero.

### 3. Real per-fund metrics from NAV history (mfapi.in)
- New `src/lib/nav-history.ts` — `useNavHistory(schemeCode)` fetches `https://api.mfapi.in/mf/{code}` (already used elsewhere), TanStack Query, 24h stale.
- New `src/lib/fund-metrics.ts` — pure functions over NAV series:
  - Trailing returns (1M, 3M, 6M, 1Y, 3Y, 5Y CAGR)
  - Annualised volatility (stdev of daily log returns × √252)
  - Max drawdown
  - Sharpe (uses `risk-free-rate.ts` which already exists)
  - Sortino
- QuantFund Score = weighted composite of those real numbers (returns 40% / Sharpe 25% / Sortino 15% / drawdown 20%), normalised within category percentile.
- Computed lazily per fund detail page. For Dashboard/Rankings top-N: precompute in a server fn `getTopRanked(category, limit)` that fans out NAV fetches (cached 6h).

### 4. Page-by-page changes
- **Home (`index.tsx`)** — replace static index strip with `<MarketIndicesStrip />` (real data). Drop "4,128 schemes / 20Y NAV" copy or replace with `{schemes.length.toLocaleString()} schemes · NAV via AMFI` computed from the live query.
- **Dashboard** — KPIs and Top Ranked recomputed from real metrics. Add "Data: AMFI {date} · Metrics computed from NAV history" footer.
- **Explorer** — keep verified-only columns (already done). Add "View metrics" link → fund detail (where ratios are real).
- **Fund detail (`fund.$id.tsx`)** — wire NAV history chart + computed metrics table + score breakdown showing each factor's contribution.
- **Compare** — load NAV history for selected funds, plot normalised NAV, show side-by-side real metrics.
- **Portfolio** — keep as-is structurally but ensure any seeded numbers are labelled "Sample portfolio" until user inputs holdings.
- **Screener** — filter on real computed metrics; show "computing…" skeleton while NAV histories load.
- **Backtest** — use real NAV series for the SIP/lumpsum simulator. If a fund has <3y history, disable backtest with a clear message.
- **Rankings** — paginated, real composite scores within each SEBI category.
- **Research Desk / AI Insights** — pass real metrics into prompts; label any LLM commentary "AI interpretation — not investment advice".
- **Settings** — no data changes, just verify links work.

### 5. Cross-cutting UI
- `<DataSourceBadge source="AMFI" updated={date} />` component, rendered in every page header that shows market/fund data.
- Standard number formatters in `src/lib/format.ts`: `fmtPct`, `fmtCurr`, `fmtNum` — used everywhere.
- Loading skeletons + error states audited for each query.

### 6. Honest marketing copy
- Replace "4,128 schemes · 20Y NAV history" with computed values from the live feed.
- Add a small "Methodology" link in the footer linking to a new `/methodology` route that explains exactly what each metric means and where the data comes from.

## What I need from you before coding

1. **Market data provider choice + API key.** TwelveData covers all your indices on one plan. Alternatives: Alpha Vantage (slow), Finnhub (limited India coverage), Kite Connect (requires Zerodha account + daily token). My recommendation: TwelveData. After you approve this plan I'll request the secret `MARKET_DATA_API_KEY`.
2. Confirm it's OK to **drop the Backtest page temporarily** if real NAV history makes it slow on first load — I'd replace it with a "computing…" state rather than removing.

## Out of scope (call out for later)
- AUM and expense ratio (no free reliable source — would need AMC scraping or a paid feed like MorningStar).
- Holdings/sector breakdown per fund.
- Real-time intraday NAV (AMFI publishes EOD only).

## Order of execution
1. Kill synthetic-metrics + scoring rewrite (small, unblocks everything).
2. NAV history + fund-metrics lib + fund detail page (proves the pipeline).
3. Market indices proxy + ticker (needs your API key).
4. Dashboard / Rankings / Screener / Compare wired to real metrics.
5. Backtest + Research Desk.
6. Copy/methodology page + final polish.
