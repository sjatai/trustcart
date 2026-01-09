import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || "reliablenissan.com";

  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return Response.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const questions = await prisma.question.findMany({
    where: { customerId: customer.id },
    orderBy: { impactScore: "desc" },
    take: 200,
    include: { needs: true, gaps: true },
  });

  return Response.json({
    ok: true,
    customer: { id: customer.id, domain: customer.domain },
    questions: questions.map((q) => ({
      id: q.id,
      taxonomy: q.taxonomy,
      // Back-compat: some UI expects `title`
      title: q.text,
      text: q.text,
      impactScore: q.impactScore,
      state: q.state,
      recommendedAssetType: q.recommendedAssetType,
      needs: (q.needs || []).map((n) => ({ id: n.id, claimKey: n.claimKey, claimId: n.claimId, required: n.required })),
      gaps: (q.gaps || []).map((g) => ({ id: g.id, gapType: g.gapType, severity: g.severity, description: g.description })),
    })),
  });
}


