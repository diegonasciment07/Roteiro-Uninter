import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf = searchParams.get("uf")?.trim().toUpperCase();

  if (!uf) {
    return Response.json(
      { error: "Informe a UF para carregar os polos." },
      { status: 400 },
    );
  }

  const polos = await prisma.polo.findMany({
    where: { uf },
    orderBy: [{ city: "asc" }, { name: "asc" }],
  });

  return Response.json(polos);
}
