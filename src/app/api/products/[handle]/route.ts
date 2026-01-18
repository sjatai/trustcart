import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = getDomainFromRequest(req);
  const handle = url.pathname.split("/").pop() || "";

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const product = await prisma.product.findFirst({
    where: { customerId: customer.id, handle },
    include: {
      patches: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
    },
  });

  if (!product) {
    return NextResponse.json({ ok: false, error: "product_not_found", handle }, { status: 404 });
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "READ",
    actor: "ORCHESTRATOR",
    summary: "Fetched product detail",
    input: { domain, handle },
    output: { updatedAt: product.updatedAt },
  });

  const published = product.patches.find((p) => p.status === "PUBLISHED");
  const draft = product.patches.find((p) => p.status === "DRAFT");

  return NextResponse.json({
    ok: true,
    product: {
      handle: product.handle,
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      currency: product.currency,
      descriptionHtml: product.descriptionHtml,
      specs: product.specs,
      publishedPatch: published
        ? {
            id: published.id,
            body: published.bodyMd,
            updatedAt: published.updatedAt,
          }
        : null,
      draftPatch: draft
        ? {
            id: draft.id,
            body: draft.bodyMd,
            updatedAt: draft.updatedAt,
          }
        : null,
    },
  });
}
