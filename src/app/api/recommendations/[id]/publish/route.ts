import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";
import { writeReceipt } from "@/lib/receipts";
import { publishDraftToAsset } from "@/lib/publish";

function extractId(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("recommendations");
  return idx >= 0 ? parts[idx + 1] : "";
}

export async function POST(req: Request) {
  const domain = getDomainFromRequest(req);
  const id = extractId(req);
  const body = await req.json().catch(() => ({}));
  const publishToShopify = body?.publishToShopify !== false;

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

  if (rec.status !== "APPROVED") {
    return NextResponse.json({ ok: false, error: "invalid_state", expected: "APPROVED", got: rec.status }, { status: 400 });
  }

  const draft = (rec.llmEvidence as any)?.draft as any;
  if (!draft) {
    return NextResponse.json({ ok: false, error: "draft_missing", hint: "POST /draft first" }, { status: 400 });
  }

  const result = await publishDraftToAsset({
    customerId: customer.id,
    domain,
    questionId: rec.questionId,
    draft,
    recommendationId: rec.id,
    publishToShopify,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, missingClaims: (result as any).missingClaims }, { status: 400 });
  }

  await prisma.contentRecommendation.update({
    where: { id: rec.id },
    data: { status: "PUBLISHED" as any },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "PUBLISH",
    actor: "CONTENT_ENGINE",
    summary: "Recommendation published",
    input: { domain, recommendationId: rec.id },
    output: { targetUrl: result.targetUrl },
  });

  return NextResponse.json({ ok: true, recommendationId: rec.id, targetUrl: result.targetUrl });
}

