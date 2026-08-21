import type { MetadataRoute } from "next";
import { BLOG_ARTICLES } from "@/lib/blog/blog-data";
import { WILAYAS, COMMUNES_BY_WILAYA } from "@/lib/schemas";

// ══════════════════════════════════════════════════════════════════
//  Dynamic sitemap.ts — Next.js App Router native sitemap.
//  Served at /sitemap.xml automatically.
//
//  Generates URLs for:
//    • Home page (ar + fr alternates)
//    • Blog index + 6 articles
//    • 3 wilaya landing pages
//    • 146 commune landing pages (57+25+64)
//    • View-specific deep links (publish, search, dashboard, account)
//
//  Total: ~160 URLs with hreflang alternates for bilingual SEO.
// ══════════════════════════════════════════════════════════════════

const BASE = "https://aqarmatch.dz";
const NOW = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // ── Home page (highest priority, daily refresh) ──────────────
  entries.push({
    url: BASE,
    lastModified: NOW,
    changeFrequency: "daily",
    priority: 1.0,
    alternates: {
      languages: {
        "ar-DZ": BASE,
        "fr-DZ": `${BASE}/?lang=fr`,
      },
    },
  });

  // ── App views (deep links from home) ─────────────────────────
  const views = [
    { path: "/?view=publish", freq: "weekly" as const, priority: 0.9 },
    { path: "/?view=search", freq: "weekly" as const, priority: 0.9 },
    { path: "/?view=dashboard", freq: "weekly" as const, priority: 0.7 },
    { path: "/?view=account", freq: "monthly" as const, priority: 0.5 },
  ];
  for (const v of views) {
    entries.push({
      url: `${BASE}${v.path}`,
      lastModified: NOW,
      changeFrequency: v.freq,
      priority: v.priority,
    });
  }

  // ── Blog index ───────────────────────────────────────────────
  entries.push({
    url: `${BASE}/blog`,
    lastModified: NOW,
    changeFrequency: "weekly",
    priority: 0.8,
  });

  // ── Blog articles ────────────────────────────────────────────
  for (const article of BLOG_ARTICLES) {
    entries.push({
      url: `${BASE}/blog/${article.slug}`,
      lastModified: new Date(article.updatedAt),
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // ── Wilaya landing pages ─────────────────────────────────────
  for (const wilaya of WILAYAS) {
    const wilayaUrl = `${BASE}/immobilier/${encodeURIComponent(wilaya)}`;
    entries.push({
      url: wilayaUrl,
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          "ar-DZ": wilayaUrl,
          "fr-DZ": `${wilayaUrl}?lang=fr`,
        },
      },
    });

    // ── Commune landing pages ──────────────────────────────────
    const communes = COMMUNES_BY_WILAYA[wilaya] || [];
    for (const commune of communes) {
      const communeUrl = `${BASE}/immobilier/${encodeURIComponent(wilaya)}/${encodeURIComponent(commune)}`;
      entries.push({
        url: communeUrl,
        lastModified: NOW,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
