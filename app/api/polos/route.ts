import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ufs = searchParams.getAll("uf").map((u) => u.trim().toUpperCase()).filter(Boolean);

  if (!ufs.length) {
    return Response.json(
      { error: "Informe a UF para carregar os polos." },
      { status: 400 },
    );
  }

  const polos = await prisma.polo.findMany({
    where: { uf: { in: ufs } },
    orderBy: [{ city: "asc" }, { name: "asc" }],
  });

  return Response.json(polos);
}
