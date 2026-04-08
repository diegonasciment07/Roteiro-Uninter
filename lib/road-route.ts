import type { Coordinates, RoadRouteLeg } from "@/lib/types";

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
}

const CACHE_VERSION = "v1";

function roundCoord(value: number) {
  return value.toFixed(5);
}

export function buildRoadRouteKey(from: Coordinates, to: Coordinates) {
  return `${roundCoord(from[0])},${roundCoord(from[1])}|${roundCoord(to[0])},${roundCoord(to[1])}`;
}

function readCache(key: string): RoadRouteLeg | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`roteirosuninter:road-route:${CACHE_VERSION}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RoadRouteLeg | null;
    if (
      !parsed ||
      !Array.isArray(parsed.path) ||
      typeof parsed.km !== "number" ||
      typeof parsed.minutes !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, leg: RoadRouteLeg) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `roteirosuninter:road-route:${CACHE_VERSION}:${key}`,
      JSON.stringify(leg),
    );
  } catch {
    // Cache best effort only.
  }
}

export async function fetchRoadRoute(from: Coordinates, to: Coordinates): Promise<RoadRouteLeg | null> {
  const key = buildRoadRouteKey(from, to);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=false`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as OsrmRouteResponse;
    const route = data.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    const distance = route?.distance;
    const duration = route?.duration;

    if (!geometry?.length || typeof distance !== "number" || typeof duration !== "number") {
      return null;
    }

    const leg: RoadRouteLeg = {
      path: geometry.map(([lon, lat]) => [lat, lon]),
      km: Math.max(1, Math.round(distance / 1000)),
      minutes: Math.max(1, Math.round(duration / 60)),
    };

    writeCache(key, leg);
    return leg;
  } catch {
    return null;
  }
}
