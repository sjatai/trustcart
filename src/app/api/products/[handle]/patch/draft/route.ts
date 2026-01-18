import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
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
  const title = body?.title;

  if (!bodyMd) {
    return NextResponse.json({ ok: false, error: "bodyMd_required" }, { status: 400 });
  }

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

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
          title: title || existingDraft.title || `${product.title} product patch`,
          bodyMd,
          evidence,
          updatedAt: new Date(),
        },
      })
    : await prisma.productPatch.create({
        data: {
          customerId: customer.id,
          productId: product.id,
          status: "DRAFT",
          title: title || `${product.title} product patch`,
          bodyMd,
          evidence,
        },
      });

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary: "Saved product patch draft",
    input: { domain, handle },
    output: { patchId: patch.id, status: patch.status },
  });

  return NextResponse.json({
    ok: true,
    patch: {
      id: patch.id,
      status: patch.status,
      bodyMd: patch.bodyMd,
      updatedAt: patch.updatedAt,
    },
  });
}
