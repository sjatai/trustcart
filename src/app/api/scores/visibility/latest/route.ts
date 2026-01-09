import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customerDomain = url.searchParams.get("customerDomain") || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";

    const customer = await prisma.customer.findUnique({ where: { domain: customerDomain } });
    if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

    const latest = await prisma.visibilityScoreSnapshot.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ ok: true, customer: { id: customer.id, domain: customer.domain }, latest });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/scores/visibility/latest" }));
    }
    throw err;
  }
}


