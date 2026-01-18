import { prisma } from "@/lib/db";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  try {
    const customerDomain = getDomainFromRequest(req);

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


