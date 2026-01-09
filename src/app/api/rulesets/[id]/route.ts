import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const updated = await prisma.ruleSet.update({
    where: { id: params.id },
    data: {
      name: body?.name,
      description: body?.description,
      json: body?.json,
      active: body?.active,
    },
  });
  return Response.json({ ok: true, ruleSet: updated });
}


