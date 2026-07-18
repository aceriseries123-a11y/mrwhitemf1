import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchNavHistory } from "../../nav-history";
import { computeFundMetrics, quantFundScore } from "../../fund-metrics";

export default defineTool({
  name: "get_fund_metrics",
  title: "Get computed risk-adjusted metrics for a mutual fund",
  description:
    "Compute trailing returns (1M/3M/6M/1Y), CAGR (3Y/5Y/10Y), annualised volatility, Sharpe, Sortino, max drawdown and the QuantFund Score for an AMFI scheme, all derived from real NAV history. Risk-free rate: 6.50% p.a. (91-day G-Sec T-Bill).",
  inputSchema: {
    scheme_code: z.string().min(1).describe("AMFI scheme code, e.g. '119598'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ scheme_code }) => {
    const h = await fetchNavHistory(scheme_code.trim());
    const m = computeFundMetrics(h.series);
    const score = quantFundScore(m);
    const data = {
      scheme_code: h.schemeCode,
      name: h.schemeName,
      amc: h.fundHouse,
      category: h.schemeCategory,
      history_years: +m.history_years.toFixed(2),
      latest_nav: m.navEnd?.nav ?? null,
      latest_nav_date: m.navEnd?.d ?? null,
      returns: {
        r1m: m.ret1m, r3m: m.ret3m, r6m: m.ret6m, r1y: m.ret1y,
        cagr3y: m.cagr3y, cagr5y: m.cagr5y, cagr10y: m.cagr10y,
      },
      risk: {
        annual_vol: m.vol,
        downside_vol: m.downsideVol,
        sharpe: m.sharpe,
        sortino: m.sortino,
        max_drawdown: m.maxDrawdown,
        rolling_positive_1y_rate: m.rollingPositive1y,
      },
      quantfund_score: score,
      score_methodology:
        "0-100 composite: 35% CAGR3Y, 25% Sharpe, 20% MaxDD, 20% rolling 1Y positive rate. Null pillars are dropped and weights renormalised. Not AI, not a prediction.",
    };
    return {
      content: [{
        type: "text",
        text: `${h.schemeName}\nQF Score: ${score != null ? score.toFixed(1) : "—"}\n3Y CAGR: ${fmt(m.cagr3y)}\nSharpe: ${m.sharpe != null ? m.sharpe.toFixed(2) : "—"}\nMax DD: ${fmt(m.maxDrawdown)}\nSource: mfapi.in / AMFI · ${h.series.length.toLocaleString()} NAV points over ${m.history_years.toFixed(1)}y`,
      }],
      structuredContent: data,
    };
  },
});

function fmt(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(2)}%`;
}
