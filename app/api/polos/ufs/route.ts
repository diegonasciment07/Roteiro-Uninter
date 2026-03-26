import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const polos = await prisma.polo.findMany({
    distinct: ["uf"],
    select: { uf: true },
    orderBy: { uf: "asc" },
  });

  return Response.json(polos.map((polo) => polo.uf));
}
