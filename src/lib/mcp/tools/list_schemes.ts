import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadSchemes } from "../amfi";
import { classifyAMFICategory } from "../../categories";

export default defineTool({
  name: "list_schemes",
  title: "List / search Indian mutual fund schemes",
  description:
    "Search the full AMFI open-ended mutual fund universe by name, AMC or scheme code, optionally filtered by SEBI category (e.g. 'Large Cap', 'ELSS'). Returns scheme code, name, AMC, category, latest NAV and NAV date.",
  inputSchema: {
    query: z
      .string()
      .describe("Case-insensitive substring match across scheme name, AMC and scheme code. Empty string returns all schemes in the filter.")
      .default(""),
    category: z
      .string()
      .describe("Optional SEBI category filter, e.g. 'Large Cap', 'Mid Cap', 'Flexi Cap', 'ELSS', 'Aggressive Hybrid', 'Short Duration'.")
      .default(""),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, category, limit }) => {
    const all = await loadSchemes();
    const q = query.trim().toLowerCase();
    const cat = category.trim();
    const rows = all
      .filter((s) => s.schemeType === "Open Ended Schemes")
      .filter((s) => (cat ? classifyAMFICategory(s.category) === cat : true))
      .filter((s) => {
        if (!q) return true;
        const hay = `${s.schemeName} ${s.amc} ${s.schemeCode}`.toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      })
      .slice(0, limit)
      .map((s) => ({
        scheme_code: s.schemeCode,
        name: s.schemeName,
        amc: s.amc,
        category: classifyAMFICategory(s.category),
        amfi_category: s.category,
        nav: s.nav,
        nav_date: s.date,
      }));

    return {
      content: [{
        type: "text",
        text: `Found ${rows.length} scheme(s)${cat ? ` in ${cat}` : ""}${q ? ` matching "${query}"` : ""}. Source: AMFI NAVAll.`,
      }],
      structuredContent: { schemes: rows, universe_size: all.length },
    };
  },
});
