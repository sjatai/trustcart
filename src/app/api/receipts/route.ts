import { prisma } from "@/lib/db";
import { isDbUnavailableError, dbUnavailablePayload } from "@/lib/dbUnavailable";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || "reliablenissan.com";
  const limit = Number(url.searchParams.get("limit") || 50);
  const kind = url.searchParams.get("kind");
  const actor = url.searchParams.get("actor");

  try {
    const customer = await prisma.customer.findUnique({ where: { domain } });
    if (!customer) return Response.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

    const receipts = await prisma.receipt.findMany({
      where: {
        customerId: customer.id,
        ...(kind ? { kind: kind as any } : {}),
        ...(actor ? { actor: actor as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, limit)),
    });

    return Response.json({ ok: true, customer: { id: customer.id, domain }, receipts });
  } catch (err) {
    if (isDbUnavailableError(err)) return Response.json(dbUnavailablePayload({ route: "/api/receipts" }));
    throw err;
  }
}


