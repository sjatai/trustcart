import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { extractNeedsVerificationMarkers } from "@/lib/contentSafety";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

function extractHandle(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  return segments[segments.indexOf("products") + 1];
}

export async function POST(req: Request) {
  const domain = getDomainFromRequest(req);
  const handle = extractHandle(req);
  const body = await req.json().catch(() => ({}));
  const bodyMd = String(body?.bodyMd || "").trim();
  const evidence = body?.evidence;
  const questionId = body?.questionId;
  const title = body?.title;

  if (!bodyMd) {
    return NextResponse.json({ ok: false, error: "bodyMd_required" }, { status: 400 });
  }

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const needsVerification = extractNeedsVerificationMarkers(bodyMd);
  if (needsVerification.length) {
    await writeReceipt({
      customerId: customer.id,
      kind: "SUPPRESS",
      actor: "CONTENT_ENGINE",
      summary: "Publish blocked: product patch contains NEEDS_VERIFICATION markers",
      input: { domain, handle, questionId },
      output: { needsVerification },
    });
    return NextResponse.json(
      { ok: false, error: "needs_verification", requiresApproval: true, missingClaims: needsVerification },
      { status: 400 }
    );
  }

  const product = await prisma.product.findFirst({ where: { customerId: customer.id, handle } });
  if (!product) {
    return NextResponse.json({ ok: false, error: "product_not_found", handle }, { status: 404 });
  }

  const existingDraft = await prisma.productPatch.findFirst({
    where: {
      customerId: customer.id,
      productId: product.id,
      status: "DRAFT",
    },
    orderBy: { updatedAt: "desc" },
  });

  const patch = existingDraft
    ? await prisma.productPatch.update({
        where: { id: existingDraft.id },
        data: {
          status: "PUBLISHED",
          title: title || existingDraft.title || `${product.title} verified specs`,
          bodyMd,
          evidence,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
      })
    : await prisma.productPatch.create({
        data: {
          customerId: customer.id,
          productId: product.id,
          status: "PUBLISHED",
          title: title || `${product.title} verified specs`,
          bodyMd,
          evidence,
          publishedAt: new Date(),
        },
      });

  const liveUrl = `/site/products/${handle}?domain=${encodeURIComponent(domain)}`;

  await writeReceipt({
    customerId: customer.id,
    kind: "PUBLISH",
    actor: "CONTENT_ENGINE",
    summary: "Published verified product patch",
    input: { domain, handle, questionId },
    output: { patchId: patch.id, liveUrl },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "DELIVERY",
    summary: "Applied product patch to product page",
    input: { handle, liveUrl },
    output: { status: patch.status },
  });

  if (questionId) {
    const updated = await prisma.question.updateMany({
      where: { id: questionId, customerId: customer.id },
      data: { state: "ANSWERED" as any },
    });
    if (updated.count > 0) {
      await writeReceipt({
        customerId: customer.id,
        kind: "DECIDE",
        actor: "ORCHESTRATOR",
        summary: "Question closed by product patch",
        input: { questionId, handle },
        output: { state: "ANSWERED" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    patch: {
      id: patch.id,
      status: patch.status,
      bodyMd: patch.bodyMd,
      publishedAt: patch.publishedAt,
    },
    liveUrl,
  });
}
