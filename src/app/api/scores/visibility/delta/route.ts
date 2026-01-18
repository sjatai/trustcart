import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customerDomain =
      url.searchParams.get("domain") ||
      url.searchParams.get("customerDomain") ||
      getDomainFromRequest(req) ||
      env.NEXT_PUBLIC_DEMO_DOMAIN ||
      "sunnysteps.com";

    const customer = await getCustomerByDomain(customerDomain).catch(() => null);
    if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

    const snaps = await prisma.visibilityScoreSnapshot.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 2,
    });

    const [current, previous] = snaps;
    const delta = current && previous ? current.total - previous.total : null;

    return Response.json({ ok: true, customer: { id: customer.id, domain: customer.domain }, current, previous, delta });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/scores/visibility/delta" }));
    }
    throw err;
  }
}


