"use client";

import "leaflet/dist/leaflet.css";

import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import { useEffect } from "react";

import type { Coordinates, PoloRecord } from "@/lib/types";

interface PlannerMapProps {
  polos: PoloRecord[];
  coordsByPoloId: Record<string, Coordinates>;
  hostPoloId: string | null;
  guestPoloIds: string[];
  tripPoloIds: string[];
  activeTab: "enc" | "rot" | "trip";
  radiusKm: number;
  onPoloClick: (polo: PoloRecord) => void;
}

const BRAZIL_CENTER: Coordinates = [-14.5, -51];

function makeMarkerIcon(color: string, size = 30) {
  return divIcon({
    className: "custom-map-pin",
    iconAnchor: [size / 2, size],
    iconSize: [size, size],
    popupAnchor: [0, -size],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="16" cy="34" rx="6" ry="2" fill="rgba(15,23,42,0.28)"/>
      <path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 24 12 24s12-15 12-24C28 5.37 22.63 0 16 0z" fill="${color}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
      <circle cx="16" cy="12" r="5" fill="rgba(255,255,255,0.92)"/>
    </svg>`,
  });
}

function MapViewport({
  allCoords,
  hostCoords,
  activeTab,
  radiusKm,
}: {
  allCoords: Coordinates[];
  hostCoords: Coordinates | null;
  activeTab: "enc" | "rot" | "trip";
  radiusKm: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (hostCoords && activeTab !== "rot") {
      map.setView(hostCoords, 10, { animate: false });
      return;
    }

    if (allCoords.length > 1) {
      map.fitBounds(latLngBounds(allCoords), { padding: [34, 34] });
      return;
    }

    if (allCoords.length === 1) {
      map.setView(allCoords[0], 10, { animate: false });
      return;
    }

    map.setView(BRAZIL_CENTER, 4, { animate: false });
  }, [activeTab, allCoords, hostCoords, map]);

  if (!hostCoords || activeTab === "rot") {
    return null;
  }

  return (
    <Circle
      center={hostCoords}
      radius={radiusKm * 1000}
      pathOptions={{
        color: "#0e5bd8",
        fillColor: "#0e5bd8",
        fillOpacity: 0.08,
        dashArray: "6 4",
      }}
    />
  );
}

export default function PlannerMap({
  polos,
  coordsByPoloId,
  hostPoloId,
  guestPoloIds,
  tripPoloIds,
  activeTab,
  radiusKm,
  onPoloClick,
}: PlannerMapProps) {
  const guestSet = new Set(guestPoloIds);
  const tripSet = new Set(tripPoloIds);
  const hostCoords = hostPoloId ? coordsByPoloId[hostPoloId] ?? null : null;

  const plotted = polos.filter((polo) => coordsByPoloId[polo.id]);
  const allCoords = plotted.map((polo) => coordsByPoloId[polo.id]);

  function iconForPolo(polo: PoloRecord) {
    if (activeTab === "trip") {
      if (tripSet.has(polo.id)) {
        return makeMarkerIcon("#58a6ff", 32);
      }

      return makeMarkerIcon("#4b5563", 28);
    }

    if (hostPoloId === polo.id) {
      return makeMarkerIcon("#ffb703", 34);
    }

    if (guestSet.has(polo.id)) {
      return makeMarkerIcon("#22c55e", 30);
    }

    if (hostPoloId) {
      return makeMarkerIcon("#4b5563", 28);
    }

    return makeMarkerIcon("#8ec5ff", 29);
  }

  return (
    <MapContainer center={BRAZIL_CENTER} zoom={4} className="planner-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapViewport
        activeTab={activeTab}
        allCoords={allCoords}
        hostCoords={hostCoords}
        radiusKm={radiusKm}
      />

      {plotted.map((polo) => (
        <Marker
          key={polo.id}
          icon={iconForPolo(polo)}
          position={coordsByPoloId[polo.id]}
          eventHandlers={{
            click: () => onPoloClick(polo),
          }}
        >
          <Tooltip direction="top" offset={[0, -20]}>
            {polo.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
