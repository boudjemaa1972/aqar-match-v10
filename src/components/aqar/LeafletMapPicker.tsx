"use client";

// ──────────────────────────────────────────────────────────────────
//  LeafletMapPicker — OpenStreetMap-based location picker.
//
//  Zero API key required. Uses:
//    • OpenStreetMap tiles (free, no key)
//    • Nominatim reverse geocoding (free, no key)
//
//  Exports the same PickedLocation interface as LocationPicker
//  so it's a drop-in replacement in PublishFlow & SearchFlow.
// ──────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin, Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import {
  WILAYAS,
  COMMUNES_BY_WILAYA,
  normalizeWilaya,
} from "@/lib/schemas";
import type { PickedLocation } from "./LocationPicker";

// Leaflet is loaded lazily inside PickableMapInner via dynamic import("leaflet")

interface Props {
  onLocationChange: (loc: PickedLocation | null) => void;
  initialLat?: number | null;
  initialLng?: number | null;
  initialWilaya?: string;
  initialCommune?: string;
  initialDistrict?: string;
  disabled?: boolean;
}

const ALGIERS_CENTER = { lat: 36.7538, lng: 3.0588 };

// Nominatim reverse geocoding (free, no API key)
async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ wilaya: string; commune: string; district: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=ar`,
      { headers: { "User-Agent": "AqarMatch/1.0" } },
    );
    if (!res.ok) return { wilaya: "", commune: "", district: "" };
    const data = await res.json();
    const addr = data.address || {};

    // Nominatim returns state/region for wilaya, town/city for commune
    const rawWilaya = addr.state || addr.region || "";
    const rawCommune =
      addr.town || addr.city || addr.village || addr.municipality || "";
    const rawDistrict =
      addr.suburb || addr.neighbourhood || addr.quarter || addr.hamlet || "";

    // Normalize wilaya to match our WILAYAS array
    const normalized = normalizeWilaya(rawWilaya);

    return {
      wilaya: normalized || "",
      commune: rawCommune,
      district: rawDistrict,
    };
  } catch {
    return { wilaya: "", commune: "", district: "" };
  }
}

export function LeafletMapPicker({
  onLocationChange,
  initialLat,
  initialLng,
  initialWilaya = "",
  initialCommune = "",
  initialDistrict = "",
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null
      ? { lat: initialLat, lng: initialLng }
      : null,
  );
  const [wilaya, setWilaya] = useState(initialWilaya);
  const [commune, setCommune] = useState(initialCommune);
  const [district, setDistrict] = useState(initialDistrict);
  const [geocoding, setGeocoding] = useState(false);
  const [center, setCenter] = useState(
    initialLat != null && initialLng != null
      ? { lat: initialLat, lng: initialLng }
      : ALGIERS_CENTER,
  );

  const communes = wilaya
    ? COMMUNES_BY_WILAYA[wilaya as keyof typeof COMMUNES_BY_WILAYA] || []
    : [];

  // Reverse geocode when marker changes
  useEffect(() => {
    if (!marker) return;
    let cancelled = false;
    setGeocoding(true);
    reverseGeocode(marker.lat, marker.lng).then((geo) => {
      if (cancelled) return;
      if (geo.wilaya) setWilaya(geo.wilaya);
      if (geo.commune) setCommune(geo.commune);
      if (geo.district) setDistrict(geo.district);
      setGeocoding(false);
    });
    return () => {
      cancelled = true;
    };
  }, [marker]);

  // Emit location change
  const emitChange = useCallback(
    (lat: number, lng: number, w: string, c: string, d: string) => {
      onLocationChange({
        lat,
        lng,
        wilaya: w,
        commune: c,
        district: d,
        districtNotFound: !d,
      });
    },
    [onLocationChange],
  );

  // When marker is set, emit after geocoding
  useEffect(() => {
    if (marker && !geocoding) {
      emitChange(marker.lat, marker.lng, wilaya, commune, district);
    }
  }, [marker, geocoding, wilaya, commune, district, emitChange]);

  function handleMapClick(lat: number, lng: number) {
    if (disabled) return;
    setMarker({ lat, lng });
    setCenter({ lat, lng });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMarker({ lat: latitude, lng: longitude });
        setCenter({ lat: latitude, lng: longitude });
      },
      () => {},
    );
  }

  // Commune change → clear district
  function handleCommuneChange(c: string) {
    setCommune(c);
    setDistrict("");
    if (marker) {
      emitChange(marker.lat, marker.lng, wilaya, c, "");
    }
  }

  // Wilaya change → clear commune + district
  function handleWilayaChange(w: string) {
    setWilaya(w);
    setCommune("");
    setDistrict("");
    if (marker) {
      emitChange(marker.lat, marker.lng, w, "", "");
    }
  }

  return (
    <div className="space-y-3">
      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border">
        <PickableMapInner
          center={center}
          marker={marker}
          onMapClick={handleMapClick}
          disabled={disabled}
        />
        {/* My Location button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={useMyLocation}
          disabled={disabled}
          className="absolute top-2 end-2 z-[500] gap-1.5 shadow-lg"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span className="text-xs">{t("locationPicker.useMyLocation")}</span>
        </Button>
        {/* Geocoding indicator */}
        {geocoding && (
          <div className="absolute bottom-2 start-2 z-[500] flex items-center gap-1.5 bg-background/90 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs shadow">
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-muted-foreground">جاري تحديد الموقع...</span>
          </div>
        )}
      </div>

      {/* Manual fields (synced from geocoding, always editable) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            الولاية
          </label>
          <select
            value={wilaya}
            onChange={(e) => handleWilayaChange(e.target.value)}
            disabled={disabled}
            className="w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">اختر الولاية</option>
            {WILAYAS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            البلدية
          </label>
          <select
            value={commune}
            onChange={(e) => handleCommuneChange(e.target.value)}
            disabled={disabled || !wilaya}
            className="w-full h-10 px-3 rounded-lg border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">{wilaya ? "اختر البلدية" : "اختر الولاية أولاً"}</option>
            {communes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            الحي
          </label>
          <Input
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              if (marker) {
                emitChange(marker.lat, marker.lng, wilaya, commune, e.target.value);
              }
            }}
            disabled={disabled}
            placeholder="الحي (اختياري)"
            className="h-10"
          />
        </div>
      </div>

      {/* Hint */}
      {!marker && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          انقر على الخريطة لتحديد موقع العقار، أو استخدم زر &quot;موقعي&quot;
        </p>
      )}
    </div>
  );
}

// ── Inner map component (rendered inside dynamic import) ──────────
function PickableMapInner({
  center,
  marker,
  onMapClick,
  disabled,
}: {
  center: { lat: number; lng: number };
  marker: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  disabled: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    // Dynamic import of leaflet
    import("leaflet").then((L) => {
      // @ts-expect-error - Leaflet internal icon fix
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [center.lat, center.lng],
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" } as any).addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://osm.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map);

      if (!disabled) {
        map.on("click", (e: any) => {
          onMapClick(e.latlng.lat, e.latlng.lng);
        });
      }

      leafletRef.current = map;

      // Add initial marker if present
      if (marker) {
        markerRef.current = L.marker([marker.lat, marker.lng])
          .addTo(map)
          .bindPopup("موقع العقار");
      }
    });

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when it changes
  useEffect(() => {
    if (!leafletRef.current) return;
    const L = require("leaflet");

    if (markerRef.current) {
      leafletRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    if (marker) {
      markerRef.current = L.marker([marker.lat, marker.lng])
        .addTo(leafletRef.current)
        .bindPopup("موقع العقار");
      leafletRef.current.setView([marker.lat, marker.lng], 16, {
        animate: true,
      });
    }
  }, [marker]);

  // Re-center when center changes
  useEffect(() => {
    if (leafletRef.current) {
      leafletRef.current.setView([center.lat, center.lng]);
    }
  }, [center]);

  return (
    <div
      ref={mapRef}
      className="h-[280px] w-full rounded-xl"
      style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
    />
  );
}
