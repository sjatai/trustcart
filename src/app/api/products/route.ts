import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  const domain = getDomainFromRequest(req);
  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const products = await prisma.product.findMany({
    where: { customerId: customer.id },
    orderBy: { updatedAt: "desc" },
    include: {
      patches: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
    },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "READ",
    actor: "ORCHESTRATOR",
    summary: "Fetched product catalog",
    input: { domain },
    output: { count: products.length },
  });

  const payload = products.map((product) => {
    const published = product.patches.find((p) => p.status === "PUBLISHED");
    const draft = product.patches.find((p) => p.status === "DRAFT");
    return {
      handle: product.handle,
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      currency: product.currency,
      updatedAt: product.updatedAt,
      publishedPatch: published
        ? {
            id: published.id,
            body: published.bodyMd,
            updatedAt: published.updatedAt,
          }
        : null,
      hasDraft: Boolean(draft),
    };
  });

  return NextResponse.json({
    ok: true,
    customer: { id: customer.id, domain: customer.domain },
    products: payload,
  });
}
