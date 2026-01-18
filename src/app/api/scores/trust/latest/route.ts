import { prisma } from "@/lib/db";
import { allowedActionsForTrust } from "@/lib/policy";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  try {
    const customerDomain = getDomainFromRequest(req);

    const customer = await prisma.customer.findUnique({ where: { domain: customerDomain } });
    if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

    const latest = await prisma.trustScoreSnapshot.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    });

    const policy = latest ? allowedActionsForTrust(latest.total) : null;

    return Response.json({ ok: true, customer: { id: customer.id, domain: customer.domain }, latest, policy });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/scores/trust/latest" }));
    }
    throw err;
  }
}


