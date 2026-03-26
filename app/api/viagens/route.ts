import { prisma } from "@/lib/prisma";
import { tripPayloadSchema } from "@/lib/validators";

export const runtime = "nodejs";

const tripInclude = {
  days: {
    include: {
      stops: {
        include: {
          polo: true,
        },
        orderBy: {
          stopIndex: "asc" as const,
        },
      },
    },
    orderBy: {
      dayIndex: "asc" as const,
    },
  },
};

export async function GET() {
  const trips = await prisma.trip.findMany({
    include: tripInclude,
    orderBy: [{ createdAt: "desc" }],
  });

  return Response.json(trips);
}

export async function POST(request: Request) {
  try {
    const payload = tripPayloadSchema.parse(await request.json());

    const created = await prisma.trip.create({
      data: {
        title: payload.title,
        traveler: payload.traveler || null,
        flightOutboundFrom: payload.flightOutboundFrom || null,
        flightOutboundTo: payload.flightOutboundTo || null,
        flightOutboundDate: payload.flightOutboundDate
          ? new Date(`${payload.flightOutboundDate}T12:00:00`)
          : null,
        flightOutboundTime: payload.flightOutboundTime || null,
        flightReturnFrom: payload.flightReturnFrom || null,
        flightReturnTo: payload.flightReturnTo || null,
        flightReturnDate: payload.flightReturnDate
          ? new Date(`${payload.flightReturnDate}T12:00:00`)
          : null,
        flightReturnTime: payload.flightReturnTime || null,
        vehicle: payload.vehicle || null,
        days: {
          create: payload.days.map((day, dayIndex) => ({
            dayIndex,
            date: day.date ? new Date(`${day.date}T12:00:00`) : null,
            overnightCity: day.overnightCity || null,
            hotel: day.hotel || null,
            stops: {
              create: day.stops.map((stop, stopIndex) => ({
                stopIndex,
                poloId: stop.poloId,
                arrivalTime: stop.arrivalTime || null,
                departureTime: stop.departureTime || null,
                objective: stop.objective || null,
              })),
            },
          })),
        },
      },
      include: tripInclude,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar a viagem.";

    return Response.json({ error: message }, { status: 400 });
  }
}
