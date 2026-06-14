# QuantFund Audit Fix — Implementation Guide

> Generated from the Full Audit Capsule · June 2025

---

## What this changeset fixes

### P0 — Critical (all addressed)

| # | Problem | File changed | Status |
|---|---------|-------------|--------|
| 1 | Silent fallback to 10 curated funds | `src/lib/live-data.ts` | ✅ Fixed |
| 2 | Dashboard uses curated funds, not AMFI universe | `src/routes/dashboard.tsx` | ✅ Fixed |
| 3 | AI Insights are hardcoded static text | `src/routes/research-desk.tsx` | ✅ Replaced |
| 4 | "AI Score" is a rules formula, not AI | `src/lib/scoring.ts` | ✅ Renamed |
| 5 | Category ranking mixes all categories | `src/routes/dashboard.tsx` + `categories.ts` | ✅ Fixed |
| 6 | Benchmark mapping is weak/wrong | `src/lib/benchmarks.ts` | ✅ Rewritten |

### P1 — High priority (all addressed)

| # | Problem | File changed | Status |
|---|---------|-------------|--------|
| 1 | Risk-free rate inconsistent across files | `src/lib/risk-free-rate.ts` | ✅ Centralised |
| 2 | Category classification too fragile | `src/lib/categories.ts` | ✅ Exhaustive map |
| 3 | No transparency layer on metrics | `src/lib/transparency.tsx` | ✅ Built |

---

## Files delivered

```
src/
├── lib/
│   ├── live-data.ts          ← AMFI loader, hard failure, no fallback
│   ├── categories.ts         ← Exhaustive AMFI category map + QuantFundCategory types
│   ├── benchmarks.ts         ← Correct benchmark per category
│   ├── risk-free-rate.ts     ← Single source of truth for RFR (Sharpe/Sortino)
│   ├── scoring.ts            ← QuantFund Score (renamed from AI Score), metric formulas
│   └── transparency.tsx      ← MetricSource component + MetricMeta instances
├── routes/
│   ├── dashboard.tsx         ← Uses useAMFISchemes(), category-scoped rankings
│   └── research-desk.tsx     ← Replaces ai-insights.tsx
```

---

## Integration steps

### 1. Replace `src/lib/live-data.ts`

Drop in the new file. Remove all references to:
- `loadCuratedSchemes()`
- `CURATED_CODES`
- `useCuratedMetrics()`

The new `useAMFISchemes()` hook is a drop-in for TanStack Query.

**Critical:** The new loader **throws** on failure. Your error boundaries
must handle this. Never add `fallbackData` or `placeholderData` pointing
to a curated list.

### 2. Replace `src/lib/benchmarks.ts`

Every place that calls `getBenchmark(category)` now gets a correctly mapped
`BenchmarkDescriptor`. Downstream Alpha/Beta/Sharpe calculations will
automatically use the right index once you plug the benchmark NAV series in.

### 3. Replace `src/lib/categories.ts` (or add)

Swap all `category.includes("large cap")` style checks for:

```ts
import { classifyAMFICategory } from "../lib/categories";
const cat = classifyAMFICategory(scheme.category); // QuantFundCategory
```

### 4. Update risk-free rate references

Find every file that hardcodes a number like `0.07` or `0.065` for RFR and
replace with:

```ts
import { RISK_FREE_RATE_ANNUAL } from "../lib/risk-free-rate";
```

### 5. Replace `src/routes/ai-insights.tsx`

- Delete `src/routes/ai-insights.tsx`
- Add `src/routes/research-desk.tsx` (provided)
- Update the route registration and nav link from `/ai-insights` → `/research-desk`

### 6. Replace `src/routes/dashboard.tsx`

The new dashboard:
- Calls `useAMFISchemes()` (full universe)
- Shows an explicit error state if AMFI is down
- Shows `Top Ranked — [Category]` (never just "Top Ranked Funds")
- Has a category tab selector

**Note:** The ranking display currently shows a placeholder ("Score pending")
for each fund. You need to wire up the scoring engine:
1. Fetch NAV history for each fund in the category
2. Compute `FundMetrics` via the formulas in `scoring.ts`
3. Call `computeQuantFundScore(fund, peers)` for each fund
4. Sort by `breakdown.total` descending
5. Replace `categorySchemes.slice(0, 10)` with the sorted, scored list

### 7. Rename UI labels everywhere

| Remove | Replace with |
|--------|-------------|
| AI Score | QuantFund Score |
| AI Ranking | QuantFund Ranking |
| AI Recommended Buys | Top Ranked Funds |
| AI Insights | Research Desk |

Search the entire `src/` tree for the string `"AI"` (case-sensitive) and
audit each occurrence.

### 8. Add transparency badges

Wrap metric displays with `<MetricSource>` from `transparency.tsx`:

```tsx
import { MetricSource, SHARPE_META } from "../lib/transparency";

<span>{fund.sharpe?.toFixed(2)}</span>
<MetricSource meta={SHARPE_META} compact />
```

---

## What NOT to build yet

Per the audit mandate, the following are deferred until P0/P1 fixes are live:

- ❌ Chatbot / conversational AI
- ❌ New UI pages
- ❌ Additional charts
- ❌ Any feature labelled "AI" or "ML"

---

## Target scores after this fix

| Area | Before | After (projected) |
|------|--------|------------------|
| Rankings | 4/10 | 7.5/10 |
| Benchmarking | 4/10 | 8/10 |
| AI Layer | 2/10 | — (removed) |
| Trustworthiness | 5/10 | 8/10 |
| UI | 8.5/10 | 8.5/10 (unchanged) |
| NAV Data | 9/10 | 9/10 (unchanged) |

---

## Open items (not in this changeset)

1. **AUM source** — needs verification. Preferred: AMC factsheets / official
   disclosures. Do not derive from NAV × units-outstanding without disclosure.

2. **Benchmark NAV history** — `benchmarks.ts` maps categories to index codes
   but index time-series data must be sourced separately (NSE indices data feed,
   or a paid vendor). Without this, Alpha/Beta cannot be computed.

3. **Expense ratio source** — AMFI portfolio disclosures are monthly; a
   dedicated AMFI API endpoint or scrape is required. Current source chain
   should be audited.

4. **Scoring engine wiring** — `scoring.ts` contains the formulas; wiring them
   to the dashboard/explorer UI requires a batch computation step (ideally a
   Cloudflare Worker cron that pre-computes scores nightly).

5. **min NAV history gate** — `MIN_NAV_HISTORY_DAYS = 252` is defined in
   `live-data.ts`. Enforce it before including a fund in any ranking.
