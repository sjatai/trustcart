import { prisma } from "@/lib/db";
import { buildAssetSlug } from "@/lib/assetSlug";
import type { BlogAsset, FaqOrTruthAsset } from "@/lib/contentEngine";
import { renderBlogToAssetContent, renderFaqOrTruthToAssetContent } from "@/lib/contentEngine";

export async function upsertDraftAssetFromFaqOrTruth(args: {
  customerId: string;
  questionId?: string | null;
  assetType: "FAQ" | "TRUTH_BLOCK";
  title: string;
  contentEngineJson: FaqOrTruthAsset;
}) {
  const slug = args.contentEngineJson.slug || buildAssetSlug(args.title, args.questionId || "draft");
  const placement = args.contentEngineJson.targetUrl || "/site/faq";
  const content = renderFaqOrTruthToAssetContent(args.contentEngineJson);

  const existing = await prisma.asset.findFirst({
    where: {
      customerId: args.customerId,
      questionId: args.questionId ?? null,
      type: args.assetType as any,
    },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!existing) {
    const created = await prisma.asset.create({
      data: {
        customerId: args.customerId,
        questionId: args.questionId ?? null,
        type: args.assetType as any,
        status: "DRAFT" as any,
        title: args.title,
        slug,
        meta: { source: "content_engine", placement, contentEngine: args.contentEngineJson } as any,
        versions: { create: { version: 1, content } },
      },
      select: { id: true },
    });
    return { assetId: created.id, slug, version: 1 };
  }

  const nextVersion = (existing.versions?.[0]?.version ?? 0) + 1;
  await prisma.assetVersion.create({
    data: { assetId: existing.id, version: nextVersion, content },
  });
  await prisma.asset.update({
    where: { id: existing.id },
    data: {
      status: "DRAFT" as any,
      title: args.title,
      slug,
      meta: { ...(existing.meta as any), source: "content_engine", placement, contentEngine: args.contentEngineJson } as any,
    },
  });

  return { assetId: existing.id, slug, version: nextVersion };
}

export async function upsertDraftAssetFromBlog(args: {
  customerId: string;
  questionId?: string | null;
  title: string;
  contentEngineJson: BlogAsset;
}) {
  const slug = args.contentEngineJson.slug || buildAssetSlug(args.title, args.questionId || "draft");
  const placement = args.contentEngineJson.targetUrl || `/site/blog/${slug}`;
  const content = renderBlogToAssetContent(args.contentEngineJson);

  const existing = await prisma.asset.findFirst({
    where: {
      customerId: args.customerId,
      questionId: args.questionId ?? null,
      type: "BLOG" as any,
      slug,
    },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!existing) {
    const created = await prisma.asset.create({
      data: {
        customerId: args.customerId,
        questionId: args.questionId ?? null,
        type: "BLOG" as any,
        status: "DRAFT" as any,
        title: args.title,
        slug,
        meta: { source: "content_engine", placement, contentEngine: args.contentEngineJson } as any,
        versions: { create: { version: 1, content } },
      },
      select: { id: true },
    });
    return { assetId: created.id, slug, version: 1 };
  }

  const nextVersion = (existing.versions?.[0]?.version ?? 0) + 1;
  await prisma.assetVersion.create({
    data: { assetId: existing.id, version: nextVersion, content },
  });
  await prisma.asset.update({
    where: { id: existing.id },
    data: {
      status: "DRAFT" as any,
      title: args.title,
      meta: { ...(existing.meta as any), source: "content_engine", placement, contentEngine: args.contentEngineJson } as any,
    },
  });

  return { assetId: existing.id, slug, version: nextVersion };
}

