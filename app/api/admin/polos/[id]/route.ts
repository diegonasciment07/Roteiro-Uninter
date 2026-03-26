import { requireAdminToken } from "@/lib/admin-token";
import { geocodePoloAddress } from "@/lib/geocode";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import {
  getPoloBlockingIssues,
  hasValidCoordinates,
  normalizeNullableText,
  normalizePostalCode,
} from "@/lib/polo-validation";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  uf: z.string().trim().length(2).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  neighborhood: z.string().trim().max(200).nullable().optional(),
  street: z.string().trim().max(400).nullable().optional(),
  postalCode: z.string().trim().max(10).nullable().optional(),
  agent: z.string().trim().max(200).nullable().optional(),
  manager: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  geocodePrecision: z.enum(["address", "street", "neighborhood", "city"]).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const existing = await prisma.polo.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Polo não encontrado." }, { status: 404 });
  }

  const normalized = {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
    ...(parsed.data.uf !== undefined ? { uf: parsed.data.uf.trim().toUpperCase() } : {}),
    ...(parsed.data.city !== undefined ? { city: parsed.data.city.trim() } : {}),
    ...(parsed.data.neighborhood !== undefined
      ? { neighborhood: normalizeNullableText(parsed.data.neighborhood) }
      : {}),
    ...(parsed.data.street !== undefined
      ? { street: normalizeNullableText(parsed.data.street) }
      : {}),
    ...(parsed.data.postalCode !== undefined
      ? { postalCode: normalizePostalCode(parsed.data.postalCode) }
      : {}),
    ...(parsed.data.agent !== undefined ? { agent: normalizeNullableText(parsed.data.agent) } : {}),
    ...(parsed.data.manager !== undefined ? { manager: normalizeNullableText(parsed.data.manager) } : {}),
    ...(parsed.data.phone !== undefined ? { phone: normalizeNullableText(parsed.data.phone) } : {}),
    ...(parsed.data.email !== undefined
      ? { email: normalizeNullableText(parsed.data.email)?.toLowerCase() ?? null }
      : {}),
    ...(parsed.data.latitude !== undefined ? { latitude: parsed.data.latitude } : {}),
    ...(parsed.data.longitude !== undefined ? { longitude: parsed.data.longitude } : {}),
    ...(parsed.data.geocodePrecision !== undefined
      ? { geocodePrecision: normalizeNullableText(parsed.data.geocodePrecision) }
      : {}),
  };
  const nextData = { ...normalized };
  const pickDefined = <T,>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);

  const nextAddress: {
    uf: string;
    city: string;
    neighborhood: string | null;
    street: string | null;
    postalCode: string | null;
  } = {
    uf: pickDefined(normalized.uf, existing.uf),
    city: pickDefined(normalized.city, existing.city),
    neighborhood: pickDefined(normalized.neighborhood, existing.neighborhood ?? null),
    street: pickDefined(normalized.street, existing.street ?? null),
    postalCode: pickDefined(normalized.postalCode, existing.postalCode ?? null),
  };
  const addressChanged =
    nextAddress.uf !== existing.uf ||
    nextAddress.city !== existing.city ||
    nextAddress.neighborhood !== existing.neighborhood ||
    nextAddress.street !== existing.street ||
    nextAddress.postalCode !== existing.postalCode;

  const coordsChanged =
    ("latitude" in normalized && normalized.latitude !== existing.latitude) ||
    ("longitude" in normalized && normalized.longitude !== existing.longitude);

  if (addressChanged && !coordsChanged) {
    const geocoded = await geocodePoloAddress(nextAddress);

    if (geocoded) {
      nextData.latitude = geocoded.lat;
      nextData.longitude = geocoded.lon;
      nextData.geocodePrecision = geocoded.precision;
    } else {
      nextData.latitude = null;
      nextData.longitude = null;
      nextData.geocodePrecision = null;
    }
  } else if (!addressChanged && !coordsChanged && parsed.data.geocodePrecision === null) {
    delete nextData.geocodePrecision;
  }

  const nextLatitude = "latitude" in nextData ? nextData.latitude : existing.latitude;
  const nextLongitude = "longitude" in nextData ? nextData.longitude : existing.longitude;

  if (
    !hasValidCoordinates(
      nextLatitude,
      nextLongitude,
    )
  ) {
    return Response.json({ error: "Latitude/longitude invalidas." }, { status: 400 });
  }

  const issues = getPoloBlockingIssues({
    uf: nextAddress.uf,
    email: "email" in nextData ? nextData.email : existing.email,
    postalCode: nextAddress.postalCode,
    latitude: nextLatitude,
    longitude: nextLongitude,
  });
  if (issues.length > 0) {
    return Response.json({ error: issues.join(" ") }, { status: 400 });
  }

  const polo = await prisma.polo.update({
    where: { id },
    data: nextData,
  });

  return Response.json(polo);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const { id } = await params;
  const polo = await prisma.polo.findUnique({ where: { id } });
  if (!polo) return Response.json({ error: "Polo não encontrado." }, { status: 404 });
  return Response.json(polo);
}
