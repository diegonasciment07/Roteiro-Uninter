"use client";

import "leaflet/dist/leaflet.css";

import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import { useEffect, useMemo, useRef } from "react";

import type { Coordinates, PoloRecord, TripRouteSegment } from "@/lib/types";

interface PlannerMapProps {
  polos: PoloRecord[];
  coordsByPoloId: Record<string, Coordinates>;
  hostPoloId: string | null;
  guestPoloIds: string[];
  encounteredPoloIds: string[];
  selectedEncounterPoloIds: string[];
  tripPoloIds: string[];
  tripRouteSegments: TripRouteSegment[];
  activeTripDayIndex: number;
  activeTab: "enc" | "rot" | "trip";
  radiusKm: number;
  showRadiusCircle: boolean;
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

function ScrollWheelControl() {
  const map = useMap();

  useEffect(() => {
    map.scrollWheelZoom.disable();
    const container = map.getContainer();
    const enable = () => map.scrollWheelZoom.enable();
    const disable = () => map.scrollWheelZoom.disable();
    container.addEventListener("mouseenter", enable);
    container.addEventListener("mouseleave", disable);
    return () => {
      container.removeEventListener("mouseenter", enable);
      container.removeEventListener("mouseleave", disable);
    };
  }, [map]);

  return null;
}

function MapViewport({
  focusCoords,
  hostCoords,
  hostPoloId,
  activeTab,
  radiusKm,
  showRadiusCircle,
}: {
  focusCoords: Coordinates[];
  hostCoords: Coordinates | null;
  hostPoloId: string | null;
  activeTab: "enc" | "rot" | "trip";
  radiusKm: number;
  showRadiusCircle: boolean;
}) {
  const map = useMap();
  const prevHostPoloId = useRef<string | null | undefined>(undefined);
  const prevActiveTab = useRef<string | undefined>(undefined);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize(false);
    }, 0);

    const hostChanged = hostPoloId !== prevHostPoloId.current;
    const tabChanged = activeTab !== prevActiveTab.current;
    prevHostPoloId.current = hostPoloId;
    prevActiveTab.current = activeTab;

    // Na aba enc: só refita quando o anfitrião mudar, não quando o raio mudar
    if (activeTab === "enc") {
      if (hostChanged && focusCoords.length > 0) {
        if (focusCoords.length > 1) {
          map.fitBounds(latLngBounds(focusCoords), { padding: [40, 40], maxZoom: 11 });
        } else {
          map.setView(focusCoords[0], 12, { animate: false });
        }
      }
      return () => window.clearTimeout(timeoutId);
    }

    // Nas outras abas: refita quando a aba mudar ou focusCoords mudar
    if (!tabChanged) return () => window.clearTimeout(timeoutId);

    if (focusCoords.length > 1) {
      map.fitBounds(latLngBounds(focusCoords), { padding: [34, 34], maxZoom: 11 });
      return () => window.clearTimeout(timeoutId);
    }

    if (focusCoords.length === 1) {
      map.setView(focusCoords[0], 10, { animate: false });
      return () => window.clearTimeout(timeoutId);
    }

    map.setView(BRAZIL_CENTER, 4, { animate: false });
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, focusCoords, hostPoloId, map]);

  useEffect(() => {
    let frame = 0;
    const scheduleInvalidate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        map.invalidateSize(false);
      });
    };

    const container = map.getContainer();
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => scheduleInvalidate()) : null;

    resizeObserver?.observe(container);
    window.addEventListener("resize", scheduleInvalidate);
    window.addEventListener("scroll", scheduleInvalidate, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleInvalidate);
      window.removeEventListener("scroll", scheduleInvalidate, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [map]);

  if (!hostCoords || activeTab !== "enc" || !showRadiusCircle) {
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
  encounteredPoloIds,
  selectedEncounterPoloIds,
  tripPoloIds,
  tripRouteSegments,
  activeTripDayIndex,
  activeTab,
  radiusKm,
  showRadiusCircle,
  onPoloClick,
}: PlannerMapProps) {
  const guestSet = new Set(guestPoloIds);
  const tripSet = new Set(tripPoloIds);
  const encounteredSet = new Set(encounteredPoloIds);
  const hostCoords = hostPoloId ? coordsByPoloId[hostPoloId] ?? null : null;

  const plotted = useMemo(
    () => polos.filter((polo) => coordsByPoloId[polo.id]),
    [coordsByPoloId, polos],
  );
  const allCoords = useMemo(
    () => plotted.map((polo) => coordsByPoloId[polo.id]),
    [coordsByPoloId, plotted],
  );
  const encounterCoords = useMemo(
    () =>
      selectedEncounterPoloIds
        .map((poloId) => coordsByPoloId[poloId])
        .filter((coord): coord is Coordinates => Boolean(coord)),
    [coordsByPoloId, selectedEncounterPoloIds],
  );
  const tripCoords = useMemo(
    () =>
      tripPoloIds
        .map((poloId) => coordsByPoloId[poloId])
        .filter((coord): coord is Coordinates => Boolean(coord)),
    [coordsByPoloId, tripPoloIds],
  );
  const focusCoords = useMemo(() => {
    if (activeTab === "trip" && tripCoords.length > 0) return tripCoords;
    if (activeTab === "enc" && encounterCoords.length > 0) return encounterCoords;
    return allCoords;
  }, [activeTab, allCoords, encounterCoords, tripCoords]);

  function iconForPolo(polo: PoloRecord) {
    if (activeTab === "trip") {
      if (tripSet.has(polo.id)) return makeMarkerIcon("#58a6ff", 32);
      if (encounteredSet.has(polo.id)) return makeMarkerIcon("#ef4444", 27);
      return makeMarkerIcon("#4b5563", 28);
    }

    if (hostPoloId === polo.id) return makeMarkerIcon("#ffb703", 34);
    if (guestSet.has(polo.id)) return makeMarkerIcon("#22c55e", 30);
    if (encounteredSet.has(polo.id)) return makeMarkerIcon("#ef4444", 27);
    if (hostPoloId) return makeMarkerIcon("#4b5563", 28);
    return makeMarkerIcon("#8ec5ff", 29);
  }

  return (
    <MapContainer center={BRAZIL_CENTER} zoom={4} className="planner-map" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ScrollWheelControl />

      <MapViewport
        activeTab={activeTab}
        focusCoords={focusCoords}
        hostCoords={hostCoords}
        hostPoloId={hostPoloId}
        radiusKm={radiusKm}
        showRadiusCircle={showRadiusCircle}
      />

      {activeTab === "trip" &&
        tripRouteSegments.map((segment) => {
          const isActiveDay = segment.dayIndex === activeTripDayIndex;
          // Rotas reais: azul sólido / laranja sólido em transições
          // Linha reta (aguardando ou sem dados): cinza tracejado
          const isStraight = !segment.routed;
          const baseColor = segment.transition ? "#f5b800" : "#1565e8";
          const color = isStraight ? "#6b7280" : baseColor;
          const dashArray = isStraight
            ? "4 8"
            : segment.transition
              ? "3 10"
              : undefined;
          return (
            <Polyline
              key={segment.id}
              positions={segment.path}
              pathOptions={{
                color,
                dashArray,
                opacity: isStraight ? (isActiveDay ? 0.55 : 0.3) : (isActiveDay ? 0.95 : 0.45),
                weight: isActiveDay ? 4 : 2.5,
                lineCap: "round",
              }}
            >
              <Tooltip sticky>
                {segment.transition ? "Transição entre dias" : `Dia ${segment.dayIndex + 1}`}
                <br />
                {segment.fromLabel} → {segment.toLabel}
                <br />
                ~{segment.km} km · ~{segment.minutes} min
                <br />
                {segment.loading
                  ? "Calculando rota viária…"
                  : segment.routed
                    ? "Rota viária real"
                    : "Linha reta (sem dados viários)"}
              </Tooltip>
            </Polyline>
          );
        })}

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
            <strong>{polo.name}</strong>
            {polo.cityPopulation != null && (
              <><br />{polo.cityPopulation.toLocaleString("pt-BR")} hab.</>
            )}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
