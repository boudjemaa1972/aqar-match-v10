"use client";

// ──────────────────────────────────────────────────────────────────
//  LocationPicker — interactive Google Maps location selector.
//
//  Features:
//  • Search box (Google Places Autocomplete) for typed address lookup.
//  • Interactive map (zoom/drag) with a draggable marker for fine-tuning.
//  • Click-to-place on the map (in addition to drag).
//  • Reverse Geocoding on every marker drop → extracts
//    wilaya / commune / district automatically.
//  • The three administrative fields are EDITABLE (not read-only) —
//    Google's data on Algerian neighbourhoods is uneven, so the user
//    must always be able to correct them manually.
//  • If Reverse Geocoding returns an empty district, shows a gentle
//    "couldn't determine the neighbourhood — please enter it manually"
//    message instead of leaving the field silently empty.
//
//  FALLBACK WHEN GOOGLE_MAPS_API_KEY IS MISSING:
//  • Renders only a small notice telling the user to use the manual
//    dropdowns below the picker. No map, no broken UI.
//    This keeps the form usable in dev environments without a key.
//
//  SECURITY:
//  ─────────
//  • The exact lat/lng is exposed ONLY to the parent component via
//    onLocationChange(). The parent is responsible for encrypting it
//    (encryptJSON → geoLocationEnc) before sending to the server.
//  • The qualitative "very close" / "close" / "moderate" labels are
//    computed server-side (matching-engine) — this component never
//    shows any distance to the user, only the picked address.
// ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Search, Loader2, AlertCircle, Crosshair } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

// ── Google Maps JS API types (minimal, only what we use) ────────
// We don't import @types/google.maps to avoid adding a dependency;
// these are the parts of the API we use, declared loosely.
declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __aqarMapsInit?: () => void;
  }
}

interface GoogleMapsLatLng {
  lat(): number;
  lng(): number;
}

interface GoogleMapsMarker {
  setPosition(latLng: GoogleMapsLatLng): void;
  setMap(map: GoogleMapsMap | null): void;
  addListener(event: string, handler: () => void): void;
}

interface GoogleMapsMap {
  setCenter(latLng: GoogleMapsLatLng): void;
  setZoom(zoom: number): void;
  addListener(event: string, handler: (e: unknown) => void): void;
  panTo(latLng: GoogleMapsLatLng): void;
}

interface GoogleMapsAutocomplete {
  addListener(event: string, handler: () => void): void;
  getPlace(): {
    geometry?: {
      location?: GoogleMapsLatLng;
    };
    formatted_address?: string;
  };
}

interface GoogleMapsGeocoderResult {
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  formatted_address: string;
}

interface GoogleMapsGeocoder {
  geocode(
    request: { location?: GoogleMapsLatLng; placeId?: string },
    callback: (
      results: GoogleMapsGeocoderResult[],
      status: string,
    ) => void,
  ): void;
}

interface GoogleMapsNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: { center: GoogleMapsLatLng; zoom: number; mapTypeControl: boolean; streetViewControl: boolean; fullscreenControl: boolean }) => GoogleMapsMap;
    Marker: new (opts: { position: GoogleMapsLatLng; map: GoogleMapsMap; draggable: boolean; title?: string }) => GoogleMapsMarker;
    LatLng: new (lat: number, lng: number) => GoogleMapsLatLng;
    places: {
      Autocomplete: new (input: HTMLInputElement, opts: { types: string[]; componentRestrictions?: { country: string } }) => GoogleMapsAutocomplete;
    };
    Geocoder: new () => { geocode: GoogleMapsGeocoder["geocode"] };
    GeocoderStatus: {
      OK: string;
      ZERO_RESULTS: string;
    };
  };
}

export interface PickedLocation {
  lat: number;
  lng: number;
  wilaya: string;
  commune: string;
  district: string; // may be empty if Reverse Geocoding couldn't determine
  districtNotFound: boolean; // true → show "please enter manually" hint
}

interface Props {
  /** Called whenever the user picks a new location (map click, drag, or search). */
  onLocationChange: (loc: PickedLocation | null) => void;
  /** Initial values (for edit mode / pre-fill). */
  initialLat?: number | null;
  initialLng?: number | null;
  initialWilaya?: string;
  initialCommune?: string;
  initialDistrict?: string;
  /** Restrict Autocomplete + map center to Algeria. Default true. */
  restrictToAlgeria?: boolean;
  /** Optional: disable the picker (e.g., during form submission). */
  disabled?: boolean;
}

// Algiers center (a sensible default map center for the Algerian market)
const ALGIERS_CENTER = { lat: 36.7538, lng: 3.0588 };
const ALGERIA_COUNTRY_CODE = "dz";

// Singleton loader — ensures the Google Maps script is loaded only once
// even if multiple LocationPicker instances are mounted simultaneously.
let mapsScriptPromise: Promise<GoogleMapsNamespace> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SSR: cannot load Google Maps"));
  }
  if ((window as unknown as { google?: GoogleMapsNamespace }).google) {
    return Promise.resolve((window as unknown as { google: GoogleMapsNamespace }).google);
  }
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const callbackName = "__aqarMapsInit";
    (window as unknown as { [k: string]: unknown })[callbackName] = () => {
      const g = (window as unknown as { google?: GoogleMapsNamespace }).google;
      if (g) resolve(g);
      else reject(new Error("Google Maps failed to load"));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () =>
      reject(new Error("Network error loading Google Maps script"));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

export function LocationPicker({
  onLocationChange,
  initialLat,
  initialLng,
  initialWilaya = "",
  initialCommune = "",
  initialDistrict = "",
  restrictToAlgeria = true,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Manual-edit fields (always editable, even after Reverse Geocoding)
  const [wilaya, setWilaya] = useState(initialWilaya);
  const [commune, setCommune] = useState(initialCommune);
  const [district, setDistrict] = useState(initialDistrict);
  const [districtNotFound, setDistrictNotFound] = useState(false);
  const [currentLat, setCurrentLat] = useState<number | null>(initialLat ?? null);
  const [currentLng, setCurrentLng] = useState<number | null>(initialLng ?? null);

  // Refs to Google objects (kept outside React state to avoid re-renders)
  const mapRef = useRef<GoogleMapsMap | null>(null);
  const markerRef = useRef<GoogleMapsMarker | null>(null);
  const googleRef = useRef<GoogleMapsNamespace | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<GoogleMapsAutocomplete | null>(null);

  // ── Notify parent whenever any field changes (lat/lng or admin) ──
  // We use a single useEffect to batch updates — parent's onLocationChange
  // is called once per change, not N times for N field updates.
  useEffect(() => {
    if (currentLat === null || currentLng === null) {
      // No coordinates picked yet → notify null (parent can clear state)
      onLocationChange(null);
      return;
    }
    onLocationChange({
      lat: currentLat,
      lng: currentLng,
      wilaya,
      commune,
      district,
      districtNotFound,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLat, currentLng, wilaya, commune, district, districtNotFound]);

  // ── Read API key from env (client-side exposed via NEXT_PUBLIC_) ──
  // We use NEXT_PUBLIC_GOOGLE_MAPS_API_KEY so the key is available in the
  // browser bundle. The key MUST be HTTP-referrer-restricted in GCP console.
  useEffect(() => {
    // Next.js exposes NEXT_PUBLIC_* at build time. We read it from a
    // global injected by the build process.
    const key =
      (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined) ||
      "";
    if (!key) {
      setError(t("locationPicker.noApiKey"));
      setLoading(false);
      return;
    }
    setApiKey(key);

    loadGoogleMaps(key)
      .then((g) => {
        googleRef.current = g;
        setMapReady(true);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("locationPicker.loadError"));
        setLoading(false);
      });
  }, [t]);

  // ── Initialize the map + marker once Google Maps is ready ──
  useEffect(() => {
    if (!mapReady || !googleRef.current || !mapContainerRef.current) return;
    const g = googleRef.current;

    const center = new g.maps.LatLng(
      currentLat ?? ALGIERS_CENTER.lat,
      currentLng ?? ALGIERS_CENTER.lng,
    );
    const map = new g.maps.Map(mapContainerRef.current, {
      center,
      zoom: currentLat !== null ? 15 : 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    const marker = new g.maps.Marker({
      position: center,
      map,
      draggable: !disabled,
      title: t("locationPicker.dragHint"),
    });
    markerRef.current = marker;

    // ── Click on map → move marker → reverse geocode ─────────
    map.addListener("click", (e: unknown) => {
      if (disabled) return;
      const ev = e as { latLng: GoogleMapsLatLng };
      const lat = ev.latLng.lat();
      const lng = ev.latLng.lng();
      marker.setPosition(ev.latLng);
      setCurrentLat(lat);
      setCurrentLng(lng);
      void reverseGeocode(lat, lng);
    });

    // ── Drag marker → reverse geocode on drop ─────────────────
    marker.addListener("dragend", () => {
      const pos = (marker as unknown as { getPosition: () => GoogleMapsLatLng }).getPosition();
      const lat = pos.lat();
      const lng = pos.lng();
      setCurrentLat(lat);
      setCurrentLng(lng);
      void reverseGeocode(lat, lng);
    });

    // ── Places Autocomplete on the search input ───────────────
    if (searchInputRef.current) {
      const ac = new g.maps.places.Autocomplete(searchInputRef.current, {
        types: ["geocode"],
        ...(restrictToAlgeria ? { componentRestrictions: { country: ALGERIA_COUNTRY_CODE } } : {}),
      });
      autocompleteRef.current = ac;
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const lat = loc.lat();
        const lng = loc.lng();
        marker.setPosition(loc);
        map.setCenter(loc);
        map.setZoom(15);
        setCurrentLat(lat);
        setCurrentLng(lng);
        void reverseGeocode(lat, lng);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, disabled]);

  // ── Use My Location: geolocate → move marker → reverse geocode ──
  const [geoLoading, setGeoLoading] = useState(false);

  function useMyLocation() {
    if (!navigator.geolocation) {
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);
        setGeoLoading(false);

        // Move marker + pan map
        if (markerRef.current && mapRef.current && googleRef.current) {
          const g = googleRef.current;
          const loc = new g.maps.LatLng(lat, lng);
          markerRef.current.setPosition(loc);
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(15);
        }

        // Reverse geocode to fill admin fields
        void reverseGeocode(lat, lng);
      },
      () => {
        setGeoLoading(false);
        // Geolocation denied — do nothing silently
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // ── Reverse Geocoding: lat/lng → wilaya / commune / district ──
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!googleRef.current) return;
      const geocoder = new googleRef.current.maps.Geocoder();
      const ll = new googleRef.current.maps.LatLng(lat, lng);
      geocoder.geocode({ location: ll }, (results, status) => {
        if (status !== "OK" || !results || results.length === 0) {
          setDistrictNotFound(true);
          return;
        }

        // Walk the address_components and extract by type.
        // Algerian administrative levels in Google's taxonomy:
        //  • "administrative_area_level_1" → wilaya
        //  • "administrative_area_level_2" → commune (daira in some cases)
        //  • "sublocality" / "neighborhood" → district (hay)
        let parsedWilaya = "";
        let parsedCommune = "";
        let parsedDistrict = "";

        for (const r of results) {
          for (const c of r.address_components) {
            if (c.types.includes("administrative_area_level_1") && !parsedWilaya) {
              parsedWilaya = c.long_name;
            } else if (c.types.includes("administrative_area_level_2") && !parsedCommune) {
              parsedCommune = c.long_name;
            } else if (
              (c.types.includes("sublocality") ||
                c.types.includes("sublocality_level_1") ||
                c.types.includes("neighborhood") ||
                c.types.includes("political")) &&
              !parsedDistrict
            ) {
              parsedDistrict = c.long_name;
            }
          }
          // Use the most precise result (first one in the array is the
          // most specific match — Google returns them in order of precision).
          if (parsedWilaya || parsedCommune || parsedDistrict) break;
        }

        setWilaya(parsedWilaya);
        setCommune(parsedCommune);
        if (parsedDistrict) {
          setDistrict(parsedDistrict);
          setDistrictNotFound(false);
        } else {
          // Reverse Geocoding couldn't determine the neighbourhood.
          // Clear the field + show the gentle "please enter manually" hint.
          setDistrict("");
          setDistrictNotFound(true);
        }
      });
    },
    [],
  );

  // ── Fallback UI when no API key ────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground mb-1">{t("locationPicker.fallbackTitle")}</p>
          <p className="text-muted-foreground text-xs">{error}</p>
          <p className="text-muted-foreground text-xs mt-2">{t("locationPicker.useManualHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search box + Use My Location button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={t("locationPicker.searchPlaceholder")}
            disabled={disabled || loading}
            className="ps-9 h-12"
            aria-label={t("locationPicker.searchPlaceholder")}
          />
          {loading && (
            <Loader2 className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={disabled || geoLoading}
          className="flex items-center gap-1.5 px-3 h-12 rounded-lg border border-border bg-background hover:bg-secondary transition text-sm font-medium whitespace-nowrap disabled:opacity-50"
          title={t("locationPicker.useMyLocation")}
        >
          {geoLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <Crosshair className="w-4 h-4 text-primary" />
          )}
          <span className="hidden sm:inline text-xs">{t("locationPicker.useMyLocation")}</span>
        </button>
      </div>

      {/* Map container */}
      <div
        ref={mapContainerRef}
        className="w-full h-64 sm:h-80 rounded-lg border border-border overflow-hidden bg-secondary"
        aria-label={t("locationPicker.mapAriaLabel")}
        role="application"
      />

      {/* Auto-filled admin fields (editable) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs mb-1.5 block flex items-center gap-1">
            <MapPin className="w-3 h-3 text-primary" />
            {t("locationPicker.wilayaLabel")}
          </Label>
          <Input
            value={wilaya}
            onChange={(e) => setWilaya(e.target.value)}
            placeholder={t("locationPicker.wilayaPlaceholder")}
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">{t("locationPicker.communeLabel")}</Label>
          <Input
            value={commune}
            onChange={(e) => setCommune(e.target.value)}
            placeholder={t("locationPicker.communePlaceholder")}
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">{t("locationPicker.districtLabel")}</Label>
          <Input
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              if (e.target.value) setDistrictNotFound(false);
            }}
            placeholder={t("locationPicker.districtPlaceholder")}
            disabled={disabled}
            className={`h-10 ${districtNotFound ? "border-amber-500/50 bg-amber-500/5" : ""}`}
          />
        </div>
      </div>

      {/* Gentle hint when district couldn't be auto-determined */}
      {districtNotFound && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{t("locationPicker.districtNotFoundHint")}</span>
        </p>
      )}

      {/* Coordinates note (only shown if picked) — qualitative only, no exact coords */}
      {currentLat !== null && currentLng !== null && (
        <p className="text-xs text-muted-foreground">
          {t("locationPicker.coordsLocked")}
        </p>
      )}
    </div>
  );
}
