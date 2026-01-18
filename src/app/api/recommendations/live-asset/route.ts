import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || getDomainFromRequest(req);
  const questionId = url.searchParams.get("questionId");
  const assetType = (url.searchParams.get("assetType") || "FAQ").toUpperCase();

  if (!questionId) {
    return NextResponse.json({ ok: false, error: "missing_questionId" }, { status: 400 });
  }

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });
  const asset = await prisma.asset.findFirst({
    where: {
      customerId: customer.id,
      questionId,
      type: assetType as any,
      status: "PUBLISHED" as any,
    },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "READ",
    actor: "CONTENT_ENGINE",
    summary: "Checked live asset for recommendation",
    input: { questionId, assetType, domain },
    output: asset ? { assetId: asset.id, slug: asset.slug } : { assetFound: false },
  });

  return NextResponse.json({
    ok: true,
    asset: asset
      ? {
          id: asset.id,
          slug: asset.slug,
          title: asset.title,
          type: asset.type,
          content: asset.versions?.[0]?.content || "",
          placement: asset.meta?.placement || null,
        }
      : null,
  });
}
