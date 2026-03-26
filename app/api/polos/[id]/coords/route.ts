import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    latitude?: number;
    longitude?: number;
    geocodePrecision?: string;
  };

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json(
      { error: "Latitude e longitude validas sao obrigatorias." },
      { status: 400 },
    );
  }

  const updated = await prisma.polo.update({
    where: { id },
    data: {
      latitude,
      longitude,
      ...(body.geocodePrecision ? { geocodePrecision: body.geocodePrecision } : {}),
    },
  });

  return Response.json(updated);
}
