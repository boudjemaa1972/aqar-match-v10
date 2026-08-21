"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue in Next.js / Leaflet
// @ts-expect-error - Leaflet internal icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapListing {
  id: string;
  intent: string;
  type: string;
  city: string;
  commune: string | null;
  displayPrice: number;
  offerTitle: string | null;
  lat: number;
  lng: number;
}

interface PropertyMapProps {
  center: { lat: number; lng: number };
  zoom: number;
  radius: number;
  listings: MapListing[];
  selectedId?: string;
  onSelectListing: (listing: MapListing) => void;
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}

// Component to handle map view re-centering on props change
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

// Component to handle map click events
function MapClickHandler({ onMapClick }: { onMapClick: (latlng: { lat: number; lng: number }) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map, onMapClick]);
  return null;
}

export default function PropertyMap({
  center,
  zoom,
  radius,
  listings,
  selectedId,
  onSelectListing,
  onMapClick,
}: PropertyMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      style={{ width: "100%", height: "100%", zIndex: 1 }}

    >
      <MapController center={center} />
      <MapClickHandler onMapClick={onMapClick} />
      
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Radius search circle */}
      <Circle
        center={[center.lat, center.lng]}
        radius={radius}
        pathOptions={{
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          weight: 2,
        }}
      />

      {/* Property Markers */}
      {listings.map((listing) => {
        const isSelected = listing.id === selectedId;
        return (
          <Marker
            key={listing.id}
            position={[listing.lat, listing.lng]}
            eventHandlers={{
              click: () => onSelectListing(listing),
            }}
          >
            <Popup>
              <div className="text-start p-1">
                <div className="font-bold text-xs mb-1">
                  {listing.offerTitle || listing.type}
                </div>
                <div className="text-primary font-bold text-sm">
                  {listing.displayPrice.toLocaleString("ar-DZ")} دج
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}