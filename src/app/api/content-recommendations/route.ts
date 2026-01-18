import type { RecommendationStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { generateContentRecommendations } from "@/lib/recommendations";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = getDomainFromRequest(req);
  const statusQuery = (url.searchParams.get("status") || "ACTIVE") as any;
  const force = url.searchParams.get("force") === "1";

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) {
    return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });
  }
  const activeStatuses: RecommendationStatus[] = ["PROPOSED", "DRAFTED", "APPROVED"];

  // End-to-end demo behavior:
  // - Default: generate recommendations only when a domain has none "active".
  // - force=1: regenerate PROPOSED recommendations (keeps any drafted/approved work intact).
  const activeCount = await prisma.contentRecommendation.count({
    where: { customerId: customer.id, status: { in: activeStatuses as any } },
  });
  if (force || activeCount === 0) {
    await generateContentRecommendations(domain);
  }

  const recommendations = await prisma.contentRecommendation.findMany({
    where:
      statusQuery === "ACTIVE"
        ? { customerId: customer.id, status: { in: activeStatuses as any } }
        : { customerId: customer.id, status: statusQuery as RecommendationStatus },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return NextResponse.json({
    ok: true,
    customer: { id: customer.id, domain: customer.domain },
    recommendations: recommendations.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      title: r.title,
      reason: r.why,
      targetUrl: r.targetUrl,
      suggestedContent: r.suggestedContent,
      claimKey: r.claimKey,
      questionId: r.questionId,
      recommendedAssetType: r.recommendedAssetType,
      llmEvidence: r.llmEvidence,
      updatedAt: r.updatedAt,
      questionText: r.questionText,
      publishTarget: r.publishTarget,
      productHandle: r.productHandle,
      productTitle: r.productTitle,
    })),
  });
}

