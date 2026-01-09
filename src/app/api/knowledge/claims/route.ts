import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customerDomain = url.searchParams.get("customerDomain") || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";

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
        evidence: (c.evidence || []).map((e) => ({ id: e.id, url: e.url, snippet: e.snippet, capturedAt: e.capturedAt })),
      })),
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/knowledge/claims" }));
    }
    throw err;
  }
}


