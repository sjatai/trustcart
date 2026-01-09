import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { allowedActionsForTrust } from "@/lib/policy";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customerDomain = url.searchParams.get("customerDomain") || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";

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


