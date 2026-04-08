import { prisma } from "@/lib/prisma";
import { encounterPayloadSchema } from "@/lib/validators";

export const runtime = "nodejs";

const encounterInclude = {
  hostPolo: true,
  participants: {
    include: { polo: true },
    orderBy: { order: "asc" as const },
  },
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const payload = encounterPayloadSchema.parse(await request.json());

    // Delete existing participants and recreate
    await prisma.encounterParticipant.deleteMany({ where: { encounterId: id } });

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        uf: payload.uf,
        hostPoloId: payload.hostPoloId,
        hostParticipants: payload.hostParticipants,
        notes: payload.notes || null,
        scheduledAt: payload.scheduledAt ? new Date(`${payload.scheduledAt}T12:00:00`) : null,
        participants: {
          create: payload.participants.map((participant, index) => ({
            poloId: participant.poloId,
            participants: participant.participants,
            order: index,
          })),
        },
      },
      include: encounterInclude,
    });

    return Response.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar o encontro.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  await prisma.encounter.delete({
    where: { id },
  });

  return Response.json({ ok: true });
}
