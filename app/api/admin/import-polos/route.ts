import { requireAdminToken } from "@/lib/admin-token";
import { prisma } from "@/lib/prisma";
import { parsePoloImport } from "@/lib/polo-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const body = (await request.json()) as { rawText?: string };
  const rawText = body.rawText?.trim();

  if (!rawText) {
    return Response.json(
      { error: "Cole o conteudo da lista de polos para importar." },
      { status: 400 },
    );
  }

  try {
    const polos = parsePoloImport(rawText);
    const chunkSize = 200;

    for (let start = 0; start < polos.length; start += chunkSize) {
      const chunk = polos.slice(start, start + chunkSize);

      await prisma.$transaction(
        chunk.map((polo) =>
          prisma.polo.upsert({
            where: { code: polo.code },
            update: polo,
            create: polo,
          }),
        ),
      );
    }

    return Response.json({
      imported: polos.length,
      message: `${polos.length} polos importados ou atualizados com sucesso.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao importar os polos.";

    return Response.json({ error: message }, { status: 400 });
  }
}
