import { requireAdminToken } from "@/lib/admin-token";
import { prisma } from "@/lib/prisma";
import { parseExcelImport } from "@/lib/excel-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  try {
    const buffer = await (file as Blob).arrayBuffer();
    const polos = parseExcelImport(buffer);
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
    const message = error instanceof Error ? error.message : "Falha ao processar o arquivo.";
    return Response.json({ error: message }, { status: 400 });
  }
}
