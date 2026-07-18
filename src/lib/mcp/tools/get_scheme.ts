import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadSchemes } from "../amfi";
import { classifyAMFICategory } from "../../categories";

export default defineTool({
  name: "get_scheme",
  title: "Get mutual fund scheme details",
  description:
    "Fetch the latest AMFI-published details for a single scheme by its AMFI scheme code (numeric string, e.g. '119598').",
  inputSchema: {
    scheme_code: z.string().min(1).describe("AMFI scheme code, e.g. '119598'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ scheme_code }) => {
    const all = await loadSchemes();
    const s = all.find((x) => x.schemeCode === scheme_code.trim());
    if (!s) {
      return {
        content: [{ type: "text", text: `Scheme ${scheme_code} not found in AMFI universe.` }],
        isError: true,
      };
    }
    const data = {
      scheme_code: s.schemeCode,
      name: s.schemeName,
      amc: s.amc,
      category: classifyAMFICategory(s.category),
      amfi_category: s.category,
      scheme_type: s.schemeType,
      isin: s.isin,
      nav: s.nav,
      nav_date: s.date,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
