"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  MapPin, SlidersHorizontal, Home, Building2, Store,
  TreePine, Sprout, Loader2, X, Crosshair, Ruler, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  WILAYAS, COMMUNES_BY_WILAYA,
  type PropertyType, type PropertyIntent,
} from "@/lib/schemas";

// Dynamic import for Leaflet map to avoid SSR issues
const LeafletMap = dynamic(() => import("@/components/aqar/PropertyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-secondary/30">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  ),
});

interface MapListing {
  id: string;
  intent: PropertyIntent;
  type: PropertyType;
  city: string;
  commune: string | null;
  district: string | null;
  askingPrice: number;
  displayPrice: number;
  pricePerNight: number | null;
  minStayNights: number | null;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  offerTitle: string | null;
  description: string | null;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  sellerFee: number;
  createdAt: string;
}

interface MapSearchViewProps {
  onSelectListing?: (listing: MapListing) => void;
  onMatchRequest?: (listing: MapListing) => void;
  initialLat?: number;
  initialLng?: number;
}

const ALGIERS_CENTER = { lat: 36.7538, lng: 3.0588 };
const DEFAULT_RADIUS = 1000;
const MIN_RADIUS = 100;
const MAX_RADIUS = 5000;

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (price >= 1_000) {
    return `${(price / 1_000).toFixed(0)}k`;
  }
  return String(price);
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} م`;
}

function getPropertyIcon(type: PropertyType) {
  switch (type) {
    case "APARTMENT": return Building2;
    case "VILLA": return Home;
    case "INDIVIDUAL_HOUSE": return Home;
    case "COMMERCIAL": return Store;
    case "BUILDABLE_LAND": return TreePine;
    case "AGRICULTURAL_LAND": return Sprout;
    default: return Home;
  }
}

function getMarkerColor(intent: PropertyIntent): string {
  switch (intent) {
    case "SELL": return "#e74c3c";
    case "RENT": return "#3498db";
    case "SEASONAL_RENT": return "#f39c12";
    default: return "#666";
  }
}

export function MapSearchView({
  onSelectListing,
  onMatchRequest,
  initialLat,
  initialLng,
}: MapSearchViewProps) {
  const { t } = useI18n();

  const [listings, setListings] = useState<MapListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MapListing | null>(null);
  const [showList, setShowList] = useState(true);

  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    initialLat != null && initialLng != null
      ? { lat: initialLat, lng: initialLng }
      : ALGIERS_CENTER
  );
  const [radius, setRadius] = useState(DEFAULT_RADIUS);

  const [intent, setIntent] = useState<PropertyIntent | "">("");
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [city, setCity] = useState("");
  const [commune, setCommune] = useState("");
  const [district, setDistrict] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const communes = useMemo(() => {
    return city ? COMMUNES_BY_WILAYA[city as keyof typeof COMMUNES_BY_WILAYA] || [] : [];
  }, [city]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("lat", String(center.lat));
      params.set("lng", String(center.lng));
      params.set("radius", String(radius));
      if (intent) params.set("intent", intent);
      if (propertyType) params.set("type", propertyType);
      if (city) params.set("city", city);
      if (commune) params.set("commune", commune);
      if (maxBudget) params.set("maxBudget", maxBudget);

      const res = await fetch(`/api/listings/map?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      console.error("Failed to fetch map listings");
    } finally {
      setLoading(false);
    }
  }, [center, radius, intent, propertyType, city, commune, maxBudget]);

  useEffect(() => {
    const timer = setTimeout(fetchListings, 300);
    return () => clearTimeout(timer);
  }, [fetchListings]);

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCenter(ALGIERS_CENTER)
    );
  }

  useEffect(() => {
    setCommune("");
    setDistrict("");
  }, [city]);

  useEffect(() => {
    setDistrict("");
  }, [commune]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Top bar filters */}
      <div className="bg-background border-b p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={intent} onValueChange={(v) => setIntent(v as PropertyIntent | "")}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="نوع العملية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SELL">بيع</SelectItem>
              <SelectItem value="RENT">إيجار</SelectItem>
              <SelectItem value="SEASONAL_RENT">إيجار موسمي</SelectItem>
            </SelectContent>
          </Select>

          <Select value={propertyType} onValueChange={(v) => setPropertyType(v as PropertyType | "")}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="نوع العقار" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APARTMENT">شقة</SelectItem>
              <SelectItem value="VILLA">فيلا</SelectItem>
              <SelectItem value="INDIVIDUAL_HOUSE">منزل فردي</SelectItem>
              <SelectItem value="COMMERCIAL">تجاري</SelectItem>
              <SelectItem value="BUILDABLE_LAND">أرض بناء</SelectItem>
              <SelectItem value="AGRICULTURAL_LAND">أرض فلاحية</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="number"
            inputMode="numeric"
            placeholder="أقصى ميزانية"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            className="w-[130px] h-9 text-xs tabular-nums"
          />

          <Button variant="outline" size="sm" onClick={useCurrentLocation} className="h-9 gap-1.5">
            <Crosshair className="w-3.5 h-3.5" />
            <span className="text-xs">موقعي</span>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="الولاية" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {WILAYAS.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={commune} onValueChange={setCommune} disabled={!city}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder={city ? "البلدية" : "اختر الولاية أولاً"} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {communes.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="text"
            placeholder="الحي (اختياري)"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="w-[130px] h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-3">
          <Ruler className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[80px]">نطاق البحث</span>
          <input
            type="range"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            step={50}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
          />
          <span className="text-sm font-bold text-foreground tabular-nums min-w-[60px] text-center">
            {formatDistance(radius)}
          </span>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className={`${showList ? "w-full md:w-[360px]" : "w-0"} transition-all border-e overflow-hidden flex flex-col bg-background z-10`}>
          {showList && (
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <span className="text-sm font-bold">{listings.length} عرض متاح</span>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                <Button variant="ghost" size="sm" onClick={() => setShowList(false)} className="md:hidden h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {listings.length === 0 && !loading && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>لا توجد عقارات في نطاق البحث</p>
                    <p className="text-xs mt-1">جرّب توسيع النطاق أو تغيير المعايير</p>
                  </div>
                )}
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    isSelected={selectedListing?.id === listing.id}
                    onClick={() => {
                      setSelectedListing(listing);
                      onSelectListing?.(listing);
                      setCenter({ lat: listing.lat, lng: listing.lng });
                    }}
                    onMatchRequest={onMatchRequest}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Leaflet Map Area */}
        <div className="flex-1 relative">
          <LeafletMap
            center={center}
            zoom={14}
            radius={radius}
            listings={listings}
            selectedId={selectedListing?.id}
            onSelectListing={(l) => {
              const full = listings.find((x) => x.id === l.id) || l as any;
              setSelectedListing(full);
              onSelectListing?.(full);
            }}
            onMapClick={(latlng) => setCenter(latlng)}
          />

          {!showList && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowList(true)}
              className="absolute top-3 start-3 z-[400] gap-1.5 shadow-lg"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-xs">{listings.length} عرض</span>
            </Button>
          )}

          {selectedListing && (
            <Card className="absolute bottom-3 start-3 end-3 md:end-auto md:w-[320px] z-[400] p-4 shadow-xl bg-background">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="font-bold text-sm leading-tight">
                  {selectedListing.offerTitle || `${selectedListing.type} — ${selectedListing.city}`}
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedListing(null)}
                  className="h-6 w-6 p-0 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="text-lg font-bold text-primary mb-1 tabular-nums">
                {selectedListing.displayPrice.toLocaleString("ar-DZ")} دج
                {selectedListing.intent === "SEASONAL_RENT" && (
                  <span className="text-xs text-muted-foreground font-normal"> / ليلة</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                <span>📍 {selectedListing.city}{selectedListing.commune ? ` / ${selectedListing.commune}` : ""}</span>
                <span>📐 {selectedListing.areaSqm} م²</span>
                {selectedListing.bedrooms != null && <span>🛏 {selectedListing.bedrooms}</span>}
                {selectedListing.distanceMeters != null && (
                  <span className="text-primary font-medium">📏 {formatDistance(selectedListing.distanceMeters)}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onSelectListing?.(selectedListing)}>
                  عرض التفاصيل
                </Button>
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => onMatchRequest?.(selectedListing)}>
                  <Sparkles className="w-3.5 h-3.5" />
                  طلب تطابق
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  isSelected,
  onClick,
  onMatchRequest,
}: {
  listing: MapListing;
  isSelected: boolean;
  onClick: () => void;
  onMatchRequest?: (listing: MapListing) => void;
}) {
  const Icon = getPropertyIcon(listing.type);

  return (
    <button
      onClick={onClick}
      className={`w-full text-start p-3 border-b hover:bg-muted/50 transition-colors ${
        isSelected ? "bg-primary/5 border-e-2 border-e-primary" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: getMarkerColor(listing.intent) }}
        >
          <div className="text-center leading-tight">
            <div className="text-xs">{formatPrice(listing.displayPrice)}</div>
            <div className="text-[8px] opacity-80">دج</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-bold truncate">
              {listing.offerTitle || `${listing.type}`}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            📍 {listing.city}{listing.commune ? ` / ${listing.commune}` : ""}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>📐 {listing.areaSqm} م²</span>
              {listing.bedrooms != null && <span>🛏 {listing.bedrooms}</span>}
              {listing.distanceMeters != null && (
                <span className="text-primary font-medium">📏 {formatDistance(listing.distanceMeters)}</span>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onMatchRequest?.(listing); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors flex-shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              تطابق
            </button>
          </div>
        </div>
      </div>
    </button>
  );
}