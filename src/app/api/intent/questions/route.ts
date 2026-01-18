import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureIntentQuestions } from "@/lib/intentGraph";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerDomain =
    url.searchParams.get("domain") ||
    url.searchParams.get("customerDomain") ||
    getDomainFromRequest(req) ||
    env.NEXT_PUBLIC_DEMO_DOMAIN ||
    "sunnysteps.com";

  const customer = await getCustomerByDomain(customerDomain).catch(() => null);
  if (!customer) {
    return Response.json({ ok: false, error: "customer_not_found", customerDomain }, { status: 404 });
  }

  const questions = await ensureIntentQuestions(customer.id);

  return Response.json({
    ok: true,
    customer: { id: customer.id, domain: customer.domain },
    questions: questions.map((q) => ({
      id: q.id,
      taxonomy: q.taxonomy,
      text: q.text,
      impactScore: q.impactScore,
      state: q.state,
      recommendedAssetType: q.recommendedAssetType,
      needs: (q.needs || []).map((n) => ({ id: n.id, claimKey: n.claimKey, required: n.required, claimId: n.claimId })),
      gaps: (q.gaps || []).map((g) => ({ id: g.id, gapType: g.gapType, severity: g.severity, description: g.description })),
    })),
  });
}


