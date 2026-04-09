import type { Coordinates } from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_PREFIX = `roteirosuninter:travel-time:${CACHE_VERSION}:`;

function coordKey(c: Coordinates) {
  return `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
}

function cacheKey(from: Coordinates, to: Coordinates) {
  return `${coordKey(from)}|${coordKey(to)}`;
}

function readCache(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const val = JSON.parse(raw);
    return typeof val === "number" ? val : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, minutes: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(minutes));
  } catch {}
}

interface OsrmTableResponse {
  code?: string;
  durations?: number[][];
}

/**
 * Fetches travel times (in minutes) from one origin to multiple destinations
 * using the OSRM Table API in a single request.
 * Returns a map of destination index -> minutes (null if unavailable).
 */
export async function fetchTravelTimes(
  from: Coordinates,
  destinations: Coordinates[],
): Promise<(number | null)[]> {
  if (!destinations.length) return [];

  // Check which destinations already have cached values
  const results: (number | null)[] = new Array(destinations.length).fill(null);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < destinations.length; i++) {
    const key = cacheKey(from, destinations[i]);
    const cached = readCache(key);
    if (cached !== null) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
    }
  }

  if (!uncachedIndices.length) return results;

  // Build coordinate string: origin first, then uncached destinations
  const uncachedCoords = uncachedIndices.map((i) => destinations[i]);
  const allCoords = [from, ...uncachedCoords];
  const coordStr = allCoords.map(([lat, lon]) => `${lon},${lat}`).join(";");

  // sources=0 means only origin is source; destinations=1,2,... are targets
  const destIndices = uncachedCoords.map((_, i) => i + 1).join(";");

  try {
    const resp = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coordStr}?sources=0&destinations=${destIndices}&annotations=duration`,
      { headers: { Accept: "application/json" } },
    );
    if (!resp.ok) return results;

    const data = (await resp.json()) as OsrmTableResponse;
    if (data.code !== "Ok" || !data.durations?.[0]) return results;

    const durations = data.durations[0]; // array of seconds from source 0 to each dest
    for (let j = 0; j < uncachedIndices.length; j++) {
      const seconds = durations[j];
      const minutes = seconds != null && seconds > 0 ? Math.round(seconds / 60) : null;
      const origIdx = uncachedIndices[j];
      results[origIdx] = minutes;
      if (minutes !== null) {
        writeCache(cacheKey(from, destinations[origIdx]), minutes);
      }
    }
  } catch {
    // Fall through — return whatever was cached
  }

  return results;
}
