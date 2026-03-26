import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  uf: z.string().trim().length(2).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  neighborhood: z.string().trim().max(200).nullable().optional(),
  street: z.string().trim().max(400).nullable().optional(),
  postalCode: z.string().trim().max(10).nullable().optional(),
  agent: z.string().trim().max(200).nullable().optional(),
  manager: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  geocodePrecision: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const polo = await prisma.polo.update({
    where: { id },
    data: parsed.data,
  });

  return Response.json(polo);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const polo = await prisma.polo.findUnique({ where: { id } });
  if (!polo) return Response.json({ error: "Polo não encontrado." }, { status: 404 });
  return Response.json(polo);
}
