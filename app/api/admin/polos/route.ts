import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf = searchParams.get("uf")?.trim().toUpperCase() || undefined;
  const q = searchParams.get("q")?.trim().toLowerCase() || undefined;
  const missing = searchParams.get("missing") === "1"; // only without coordinates

  const polos = await prisma.polo.findMany({
    where: {
      ...(uf ? { uf } : {}),
      ...(missing ? { AND: [{ latitude: null }, { longitude: null }] } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ uf: "asc" }, { city: "asc" }, { name: "asc" }],
    take: 500,
  });

  return Response.json(polos);
}
