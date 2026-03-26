import { z } from "zod";

export const poloImportItemSchema = z.object({
  cod: z.coerce.number().int(),
  nome: z.string().min(1),
  uf: z.string().trim().min(2).max(2),
  cidade: z.string().min(1),
  bairro: z.string().optional().nullable(),
  rua: z.string().optional().nullable(),
  agente: z.string().optional().nullable(),
  gestor: z.string().optional().nullable(),
  tel: z.union([z.string(), z.number()]).optional().nullable(),
  email: z.string().optional().nullable(),
});

export const encounterPayloadSchema = z.object({
  uf: z.string().trim().min(2).max(2),
  hostPoloId: z.string().min(1),
  hostParticipants: z.coerce.number().int().min(0),
  scheduledAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  participants: z.array(
    z.object({
      poloId: z.string().min(1),
      participants: z.coerce.number().int().min(0),
    }),
  ),
});

export const tripPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  traveler: z.string().trim().max(200).optional().nullable(),
  flightOutboundFrom: z.string().trim().max(200).optional().nullable(),
  flightOutboundTo: z.string().trim().max(200).optional().nullable(),
  flightOutboundDate: z.string().trim().optional().nullable(),
  flightOutboundTime: z.string().trim().optional().nullable(),
  flightReturnFrom: z.string().trim().max(200).optional().nullable(),
  flightReturnTo: z.string().trim().max(200).optional().nullable(),
  flightReturnDate: z.string().trim().optional().nullable(),
  flightReturnTime: z.string().trim().optional().nullable(),
  vehicle: z.string().trim().max(200).optional().nullable(),
  days: z.array(
    z.object({
      date: z.string().trim().optional().nullable(),
      overnightCity: z.string().trim().max(200).optional().nullable(),
      hotel: z.string().trim().max(200).optional().nullable(),
      stops: z.array(
        z.object({
          poloId: z.string().min(1),
          arrivalTime: z.string().trim().optional().nullable(),
          departureTime: z.string().trim().optional().nullable(),
          objective: z.string().trim().max(500).optional().nullable(),
        }),
      ),
    }),
  ),
});
