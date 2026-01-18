import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";
import { writeReceipt } from "@/lib/receipts";

function extractId(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("recommendations");
  return idx >= 0 ? parts[idx + 1] : "";
}

export async function POST(req: Request) {
  const domain = getDomainFromRequest(req);
  const id = extractId(req);

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const rec = await prisma.contentRecommendation.findUnique({ where: { id } });
  if (!rec || rec.customerId !== customer.id) {
    return NextResponse.json({ ok: false, error: "recommendation_not_found", id }, { status: 404 });
  }

  // Only discard if not already published.
  if (rec.status === ("PUBLISHED" as any)) {
    return NextResponse.json({ ok: false, error: "already_published", id }, { status: 400 });
  }

  // Clean up any saved drafts tied to this recommendation.
  // - Asset drafts store meta.recommendationId
  // - ProductPatch drafts store evidence.recommendationId
  await prisma.asset.deleteMany({
    where: { customerId: customer.id, status: "DRAFT" as any, meta: { path: ["recommendationId"], equals: rec.id } as any },
  });
  await prisma.productPatch.deleteMany({
    where: { customerId: customer.id, status: "DRAFT" as any, evidence: { path: ["recommendationId"], equals: rec.id } as any },
  });

  await prisma.contentRecommendation.delete({ where: { id: rec.id } });

  await writeReceipt({
    customerId: customer.id,
    kind: "SUPPRESS",
    actor: "CONTENT_ENGINE",
    summary: "Recommendation discarded by user",
    input: { domain, recommendationId: rec.id },
    output: { publishTarget: rec.publishTarget, title: rec.title },
  });

  return NextResponse.json({ ok: true, discarded: true, recommendationId: rec.id });
}

