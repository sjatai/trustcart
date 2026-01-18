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

  const action = String((rec.llmEvidence as any)?.action || "").toUpperCase();
  if (action && !["CREATE", "UPDATE"].includes(action)) {
    return NextResponse.json({ ok: false, error: "no_action", action }, { status: 400 });
  }

  if (rec.status !== "DRAFTED") {
    return NextResponse.json({ ok: false, error: "invalid_state", expected: "DRAFTED", got: rec.status }, { status: 400 });
  }

  // Ensure draft exists.
  const draft = (rec.llmEvidence as any)?.draft;
  if (!draft) {
    return NextResponse.json({ ok: false, error: "draft_missing", hint: "POST /draft first" }, { status: 400 });
  }

  // If this rec maps to an Asset draft, mark it approved.
  if (String(rec.kind) !== "PRODUCT_UPDATE") {
    const assetType = String(draft?.type || rec.recommendedAssetType || "FAQ").toUpperCase();
    const slug = String(draft?.slug || "");
    const asset = await prisma.asset.findFirst({ where: { customerId: customer.id, type: assetType as any, slug } });
    if (!asset) {
      return NextResponse.json({ ok: false, error: "asset_draft_missing", assetType, slug }, { status: 400 });
    }
    await prisma.asset.update({
      where: { id: asset.id },
      data: { status: "APPROVED" as any },
    });
  } else {
    // Product patches are stored as DRAFT until publish; approval is tracked on the recommendation itself.
  }

  const approved = await prisma.contentRecommendation.update({
    where: { id: rec.id },
    data: {
      status: "APPROVED" as any,
      approvedAt: new Date(),
      approvedBy: "mission_control",
    },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary: "Approved draft for recommendation",
    input: { domain, recommendationId: rec.id },
    output: { status: approved.status },
  });

  return NextResponse.json({ ok: true, recommendationId: rec.id, status: approved.status });
}

