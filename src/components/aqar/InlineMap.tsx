"use client";

// ──────────────────────────────────────────────────────────────────
//  InlineMap — embeds a Google Maps iframe centered on a given lat/lng.
//
//  Uses the public Google Maps embed URL (no API key required for the
//  basic `q=` mode). If the coordinates are missing or invalid, shows
//  a fallback message instead of an empty/broken map.
//
//  SECURITY: this component receives already-decrypted lat/lng from the
//  parent (which fetched them from /api/match/[id]/pay-fee or /status
//  after BUYER_FEE_PAID). The parent is responsible for only passing
//  geo data that the user is authorized to see.
// ──────────────────────────────────────────────────────────────────

import { MapPin, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  geo: { lat: number; lng: number; accuracy?: number | null } | null;
  label?: string; // optional address/caption to display under the map
  className?: string;
}

export function InlineMap({ geo, label, className = "" }: Props) {
  const { t } = useI18n();

  // ── No GPS coordinates → fallback message ─────────────────────
  if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") {
    return (
      <div className={`rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center ${className}`}>
        <AlertCircle className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">
          {t("match.noGeo")}
        </p>
      </div>
    );
  }

  // ── Build Google Maps embed URL (no API key needed for `q=` mode) ──
  // We round to 6 decimal places (~0.1m precision) to avoid leaking
  // sub-meter GPS accuracy in the URL (which could be logged by Google).
  const lat = Number(geo.lat.toFixed(6));
  const lng = Number(geo.lng.toFixed(6));
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  // External link for "open in Google Maps" button
  const linkUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div className={className}>
      <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm">
        <iframe
          src={embedUrl}
          width="100%"
          height="280"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          title={t("match.mapTitle")}
          className="block"
        />
      </div>
      {label && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="leading-relaxed">{label}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {geo.accuracy != null && (
          <span className="text-[10px] text-muted-foreground">
            {t("match.geoAccuracy", { m: Math.round(geo.accuracy) })}
          </span>
        )}
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline ms-auto inline-flex items-center gap-1"
        >
          {t("match.openInMaps")}
          ↗
        </a>
      </div>
    </div>
  );
}
