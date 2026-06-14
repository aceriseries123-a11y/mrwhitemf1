import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://mrwhitemf1.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/dashboard", changefreq: "daily", priority: "0.9" },
          { path: "/explorer", changefreq: "daily", priority: "0.9" },
          { path: "/compare", changefreq: "weekly", priority: "0.7" },
          { path: "/portfolio", changefreq: "weekly", priority: "0.7" },
          { path: "/screener", changefreq: "weekly", priority: "0.7" },
          { path: "/backtest", changefreq: "weekly", priority: "0.6" },
          { path: "/research-desk", changefreq: "weekly", priority: "0.6" },
          { path: "/rankings", changefreq: "daily", priority: "0.8" },
          { path: "/settings", changefreq: "monthly", priority: "0.3" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
