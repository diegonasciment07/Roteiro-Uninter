import { prisma } from "@/lib/prisma";
import { encounterPayloadSchema } from "@/lib/validators";

export const runtime = "nodejs";

const encounterInclude = {
  hostPolo: true,
  participants: {
    include: {
      polo: true,
    },
    orderBy: {
      order: "asc" as const,
    },
  },
};

export async function GET() {
  const encounters = await prisma.encounter.findMany({
    include: encounterInclude,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
  });

  return Response.json(encounters);
}

export async function POST(request: Request) {
  try {
    const payload = encounterPayloadSchema.parse(await request.json());

    const created = await prisma.encounter.create({
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

    return Response.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar o encontro.";

    return Response.json({ error: message }, { status: 400 });
  }
}
