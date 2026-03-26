import type { GeocodePrecision } from "@/lib/geocode";

const VALID_UFS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PoloLike = {
  uf?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodePrecision?: string | null;
};

export function normalizeNullableText(value?: string | null) {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

export function normalizePostalCode(value?: string | null) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;

  const digits = normalized.replace(/\D/g, "");
  if (digits.length !== 8) return normalized;

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function hasValidPostalCode(value?: string | null) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return true;
  return normalized.replace(/\D/g, "").length === 8;
}

export function hasValidEmail(value?: string | null) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return true;
  return EMAIL_REGEX.test(normalized);
}

export function hasValidCoordinates(latitude?: number | null, longitude?: number | null) {
  if (latitude == null && longitude == null) return true;
  if (latitude == null || longitude == null) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function getPoloBlockingIssues(polo: PoloLike) {
  const issues: string[] = [];

  if (polo.uf != null && polo.uf.trim() && !VALID_UFS.has(polo.uf.trim().toUpperCase())) {
    issues.push("UF invalida.");
  }

  if (!hasValidPostalCode(polo.postalCode)) {
    issues.push("CEP invalido. Use 8 digitos.");
  }

  if (!hasValidEmail(polo.email)) {
    issues.push("E-mail invalido.");
  }

  if (!hasValidCoordinates(polo.latitude, polo.longitude)) {
    issues.push("Latitude/longitude invalidas.");
  }

  return issues;
}

export function getPoloAttentionIssues(polo: PoloLike) {
  const issues: string[] = [];

  if (!normalizeNullableText(polo.street)) {
    issues.push("Endereco sem rua/logradouro.");
  }

  if (!normalizeNullableText(polo.postalCode)) {
    issues.push("Endereco sem CEP.");
  }

  if (!normalizeNullableText(polo.neighborhood)) {
    issues.push("Endereco sem bairro.");
  }

  if (!normalizeNullableText(polo.city)) {
    issues.push("Cidade ausente.");
  }

  if (!normalizeNullableText(polo.phone)) {
    issues.push("Telefone ausente.");
  }

  if (polo.latitude == null || polo.longitude == null) {
    issues.push("Sem coordenadas salvas.");
  }

  if (
    polo.geocodePrecision &&
    (polo.geocodePrecision === "city" || polo.geocodePrecision === "neighborhood")
  ) {
    const precision = polo.geocodePrecision as GeocodePrecision;
    issues.push(
      precision === "city"
        ? "Pin ainda esta no nivel da cidade."
        : "Pin ainda esta no nivel do bairro."
    );
  }

  return issues;
}
