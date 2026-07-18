import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchNavHistory } from "../../nav-history";

export default defineTool({
  name: "get_nav_history",
  title: "Get NAV history for a mutual fund scheme",
  description:
    "Fetch historical daily Net Asset Values for an AMFI mutual fund scheme (sourced from mfapi.in, a community mirror of AMFI). Returns oldest-first.",
  inputSchema: {
    scheme_code: z.string().min(1).describe("AMFI scheme code, e.g. '119598'."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .describe("Maximum number of most-recent NAV points to return. Use small values (e.g. 60) to keep responses compact.")
      .default(365),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ scheme_code, limit }) => {
    const h = await fetchNavHistory(scheme_code.trim());
    const points = h.series.slice(-limit).map((p) => ({ date: p.d, nav: p.nav }));
    return {
      content: [{
        type: "text",
        text: `${h.schemeName} — returning last ${points.length} of ${h.series.length.toLocaleString()} NAV points. Source: mfapi.in / AMFI.`,
      }],
      structuredContent: {
        scheme_code: h.schemeCode,
        name: h.schemeName,
        amc: h.fundHouse,
        category: h.schemeCategory,
        total_points: h.series.length,
        returned_points: points.length,
        points,
      },
    };
  },
});
