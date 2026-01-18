import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { buildAssetSlug } from "@/lib/assetSlug";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || body?.domain || getDomainFromRequest(req);
  const questionId = body?.questionId;
  const assetType = (body?.assetType || "FAQ").toUpperCase();
  const title = String(body?.title || body?.questionText || "Draft");
  const content = String(body?.content || "");

  if (!questionId) {
    return NextResponse.json({ ok: false, error: "missing_questionId" }, { status: 400 });
  }

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });
  const slug = buildAssetSlug(title, questionId);

  let asset = await prisma.asset.findFirst({
    where: {
      customerId: customer.id,
      questionId,
      type: assetType as any,
    },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!asset) {
    asset = await prisma.asset.create({
      data: {
        customerId: customer.id,
        questionId,
        type: assetType as any,
        status: "DRAFT" as any,
        title,
        slug,
        versions: {
          create: {
            version: 1,
            content,
          },
        },
        meta: { source: "recommendations_panel", placement: assetType === "BLOG" ? `/site/blog/${slug}` : "/site/faq" },
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  } else {
    const nextVersion = (asset.versions?.[0]?.version ?? 0) + 1;
    await prisma.assetVersion.create({
      data: {
        assetId: asset.id,
        version: nextVersion,
        content,
      },
    });

    asset = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "DRAFT" as any,
        title,
        slug,
        meta: { source: "recommendations_panel", placement: assetType === "BLOG" ? `/site/blog/${slug}` : "/site/faq" },
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary: "Saved draft for recommendation",
    input: { questionId, assetType, domain },
    output: { assetId: asset.id, version: asset.versions?.[0]?.version },
  });

  return NextResponse.json({
    ok: true,
    asset: {
      id: asset.id,
      slug: asset.slug,
      title: asset.title,
      status: asset.status,
      version: asset.versions?.[0]?.version,
    },
  });
}
