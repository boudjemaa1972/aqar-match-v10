"use client";

// ──────────────────────────────────────────────────────────────────
//  PageMeta — dynamically updates document.title, meta description,
//  keywords, Open Graph, Twitter Card, and canonical URL based on the
//  current view + language.
//
//  Since the platform is a single-page app (all views render under `/`),
//  Next.js server-side metadata can't differentiate views. This client
//  component handles the dynamic update on view/language change.
//
//  The base metadata (from layout.tsx generateMetadata) covers the
//  initial SSR load (home page). This component takes over for
//  client-side navigation.
// ──────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/components/aqar/TopNav";

interface Props {
  view: NavView;
}

export function PageMeta({ view }: Props) {
  const { t, lang } = useI18n();

  useEffect(() => {
    const viewKey = view as string;
    const title = t(`meta.${viewKey}.title`);
    const description = t(`meta.${viewKey}.description`);
    const keywords = t(`meta.${viewKey}.keywords`);

    // ── Document title ──────────────────────────────────────────
    document.title = title;

    // ── Meta description ────────────────────────────────────────
    upsertMeta("description", description);

    // ── Meta keywords ───────────────────────────────────────────
    upsertMeta("keywords", keywords);

    // ── Open Graph tags ─────────────────────────────────────────
    upsertMetaProperty("og:title", title);
    upsertMetaProperty("og:description", description);
    upsertMetaProperty("og:type", "website");
    upsertMetaProperty("og:site_name", "عقار Match");
    upsertMetaProperty("og:locale", lang === "ar" ? "ar_DZ" : "fr_DZ");

    // ── Twitter Card tags ───────────────────────────────────────
    upsertMeta("twitter:card", "summary_large_image");
    upsertMeta("twitter:title", title);
    upsertMeta("twitter:description", description);

    // ── Canonical URL ───────────────────────────────────────────
    upsertCanonical();

    // ── robots ──────────────────────────────────────────────────
    upsertMeta("robots", "index, follow");
  }, [view, t, lang]);

  return null; // This component renders nothing visible.
}

// ── Helpers ───────────────────────────────────────────────────────

function upsertMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical() {
  const url = window.location.href;
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}
