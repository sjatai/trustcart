import { prisma } from "@/lib/db";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  try {
    const customerDomain = getDomainFromRequest(req);

    const customer = await prisma.customer.findUnique({ where: { domain: customerDomain } });
    if (!customer) {
      return Response.json({ ok: false, error: "customer_not_found", customerDomain }, { status: 404 });
    }

    const claims = await prisma.claim.findMany({
      where: { customerId: customer.id },
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: {
        evidence: { orderBy: { capturedAt: "desc" }, take: 5 },
        location: true,
      },
    });

    return Response.json({
      ok: true,
      customer: { id: customer.id, domain: customer.domain },
      claims: claims.map((c) => ({
        id: c.id,
        scope: c.scope,
        key: c.key,
        value: c.value,
        confidence: c.confidence,
        freshnessAt: c.freshnessAt,
        updatedAt: c.updatedAt,
        location: c.location ? { id: c.location.id, name: c.location.name, slug: c.location.slug } : null,
        evidence: (c.evidence || []).map((e) => ({
          id: e.id,
          url: e.url,
          snippet: e.snippet,
          capturedAt: e.capturedAt,
          crawlRunId: e.crawlRunId,
        })),
      })),
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/knowledge/claims" }));
    }
    throw err;
  }
}


