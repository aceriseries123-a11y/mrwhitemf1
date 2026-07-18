import { defineMcp } from "@lovable.dev/mcp-js";
import listSchemes from "./tools/list_schemes";
import getScheme from "./tools/get_scheme";
import getNavHistory from "./tools/get_nav_history";
import getFundMetrics from "./tools/get_fund_metrics";

export default defineMcp({
  name: "quantfund-mcp",
  title: "QuantFund — Indian Mutual Fund Research",
  version: "0.1.0",
  instructions:
    "Tools for researching Indian mutual funds using live AMFI data. Use `list_schemes` to search the ~4,000-scheme universe by name/AMC/category and get scheme codes. Use `get_scheme` for the latest NAV and metadata. Use `get_nav_history` for historical daily NAVs (sourced from mfapi.in). Use `get_fund_metrics` to get real risk-adjusted metrics — trailing returns, CAGR, Sharpe, Sortino, max drawdown and the transparent QuantFund Score — all computed from actual NAV history. All data is public (AMFI + mfapi.in); no authentication required.",
  tools: [listSchemes, getScheme, getNavHistory, getFundMetrics],
});
