/**
 * Geocoding utilities — Nominatim (OpenStreetMap)
 *
 * Estratégia em cascata, do mais preciso ao menos preciso:
 *   1. Busca estruturada: street + city + state  (nível de endereço)
 *   2. Busca estruturada: street + city          (sem estado, evita conflito de nome)
 *   3. Busca livre:       rua, bairro, cidade, estado, Brasil
 *   4. Busca livre:       rua, cidade, estado, Brasil
 *   5. Busca estruturada: city + state           (fallback cidade)
 *
 * O campo `place_rank` do Nominatim indica precisão:
 *   ≤ 28 = endereço/prédio/POI  → "address"
 *   29–30 = rua                 → "street"
 *   16–20 = bairro/distrito     → "neighborhood"
 *   > 30  = cidade/município    → "city"
 */

export type GeocodePrecision = "address" | "street" | "neighborhood" | "city";

export interface GeocodeResult {
  lat: number;
  lon: number;
  precision: GeocodePrecision;
  displayName: string;
}

interface GeocodeCachePayload extends GeocodeResult {
  addressKey?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  place_rank: number;
  display_name: string;
  type: string;
  class: string;
  importance: number;
}

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará",
  PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

function rankToPrecision(rank: number, type: string): GeocodePrecision {
  if (rank <= 28 || ["house", "building", "amenity", "office", "school", "university"].includes(type)) {
    return "address";
  }
  if (rank <= 30 || ["street", "road", "footway", "residential"].includes(type)) {
    return "street";
  }
  if (rank <= 22 || ["suburb", "neighbourhood", "quarter", "district"].includes(type)) {
    return "neighborhood";
  }
  return "city";
}

async function nominatimFetch(params: URLSearchParams): Promise<NominatimResult | null> {
  params.set("format", "json");
  params.set("limit", "1");
  params.set("accept-language", "pt-BR");
  params.set("countrycodes", "br");
  params.set("addressdetails", "0");

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { "Accept": "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Tenta geocodificar com a estratégia em cascata.
 * Retorna null se nenhuma tentativa encontrar resultado.
 */
export async function geocodePoloAddress(polo: {
  street: string | null;
  neighborhood: string | null;
  city: string;
  uf: string;
  postalCode?: string | null;
}): Promise<GeocodeResult | null> {
  const state = UF_NAMES[polo.uf] ?? polo.uf;
  const street = polo.street?.trim() || null;
  const neighborhood = polo.neighborhood?.trim() || null;
  const city = polo.city.trim();
  // Normaliza CEP: remove traços e espaços → "64460-000" → "64460000"
  const cep = polo.postalCode?.trim().replace(/\D/g, "") || null;

  const attempts: Array<() => Promise<NominatimResult | null>> = [];

  // 1. Endereço estruturado completo
  if (cep && street) {
    attempts.push(() => {
      const p = new URLSearchParams({ street, city, state, postalcode: cep, country: "Brazil" });
      return nominatimFetch(p);
    });
  }

  // 2. Busca estruturada completa sem CEP
  if (street) {
    attempts.push(() => {
      const p = new URLSearchParams({ street, city, state, country: "Brazil" });
      return nominatimFetch(p);
    });
  }

  // 3. Busca livre com rua + bairro + cidade + estado + CEP
  if (street) {
    if (neighborhood) {
      attempts.push(() => {
        const p = new URLSearchParams({
          q: [street, neighborhood, city, state, cep, "Brasil"].filter(Boolean).join(", "),
        });
        return nominatimFetch(p);
      });
    }

    // 4. Sem estado (evita conflito quando cidade tem mesmo nome em outro estado)
    attempts.push(() => {
      const p = new URLSearchParams({ street, city, country: "Brazil" });
      return nominatimFetch(p);
    });

    // 5. Busca livre sem bairro
    attempts.push(() => {
      const p = new URLSearchParams({ q: [street, city, state, "Brasil"].join(", ") });
      return nominatimFetch(p);
    });
  }

  // 6. Busca por CEP contextualizado
  if (cep) {
    attempts.push(() => {
      const p = new URLSearchParams({
        q: [cep, city, state, "Brasil"].join(", "),
      });
      return nominatimFetch(p);
    });

    attempts.push(() => {
      const p = new URLSearchParams({ postalcode: cep, country: "Brazil" });
      return nominatimFetch(p);
    });
  }

  // 7. Busca por bairro + cidade (quando não tem rua nem CEP)
  if (neighborhood && !street && !cep) {
    attempts.push(() => {
      const p = new URLSearchParams({
        q: [neighborhood, city, state, "Brasil"].join(", "),
      });
      return nominatimFetch(p);
    });
  }

  // 8. Fallback: só cidade + estado
  attempts.push(() => {
    const p = new URLSearchParams({ city, state, country: "Brazil" });
    return nominatimFetch(p);
  });

  for (const attempt of attempts) {
    const result = await attempt();
    if (result) {
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        precision: rankToPrecision(result.place_rank, result.type),
        displayName: result.display_name,
      };
    }
  }

  return null;
}

/** Versão do cache — incrementar invalida entradas antigas */
const CACHE_VERSION = "v3";

function buildAddressKey(polo: {
  street: string | null;
  neighborhood: string | null;
  city: string;
  uf: string;
  postalCode?: string | null;
}) {
  return [
    polo.uf.trim().toUpperCase(),
    polo.city.trim().toLowerCase(),
    polo.neighborhood?.trim().toLowerCase() ?? "",
    polo.street?.trim().toLowerCase() ?? "",
    polo.postalCode?.trim().replace(/\D/g, "") ?? "",
  ].join("|");
}

export function getGeoCache(
  code: number,
  polo?: {
    street: string | null;
    neighborhood: string | null;
    city: string;
    uf: string;
    postalCode?: string | null;
  },
): GeocodeResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`roteirosuninter:geo:${CACHE_VERSION}:${code}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GeocodeCachePayload;
    if (polo && parsed.addressKey && parsed.addressKey !== buildAddressKey(polo)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setGeoCache(
  code: number,
  result: GeocodeResult,
  polo?: {
    street: string | null;
    neighborhood: string | null;
    city: string;
    uf: string;
    postalCode?: string | null;
  },
) {
  if (typeof window === "undefined") return;
  try {
    const payload: GeocodeCachePayload = polo
      ? { ...result, addressKey: buildAddressKey(polo) }
      : result;
    window.localStorage.setItem(
      `roteirosuninter:geo:${CACHE_VERSION}:${code}`,
      JSON.stringify(payload),
    );
  } catch { /* quota exceeded, ignore */ }
}

export function clearGeoCache(code: number) {
  if (typeof window === "undefined") return;
  // Limpa versão atual e versões legadas
  for (const key of [
    `roteirosuninter:geo:${CACHE_VERSION}:${code}`,
    `roteirosuninter:geo:v2:${code}`,
    `roteirosuninter:geo:${code}`,
  ]) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
