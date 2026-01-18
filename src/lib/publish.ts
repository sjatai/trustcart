import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import type { DraftPayload } from "@/lib/contentDraft";
import { extractNeedsVerificationMarkers } from "@/lib/contentSafety";
import { createOrUpdateBlogArticle, isShopifyEnabled, updateProductMetafields, upsertFaqPage } from "@/lib/publishers/shopify";

export async function publishDraftToAsset(args: {
  customerId: string;
  domain: string;
  questionId?: string | null;
  draft: DraftPayload;
  recommendationId?: string;
  publishToShopify?: boolean;
}) {
  // Safety switch (hard fail): do not publish if draft contains needs verification markers.
  const markers = extractNeedsVerificationMarkers(args.draft.content.bodyMarkdown || "");
  if (args.draft.content.needsVerification?.length || markers.length) {
    const missing = Array.from(new Set([...(args.draft.content.needsVerification || []), ...markers]));
    await writeReceipt({
      customerId: args.customerId,
      kind: "SUPPRESS",
      actor: "CONTENT_ENGINE",
      summary: "Publish blocked: needs verification",
      input: { domain: args.domain, recommendationId: args.recommendationId, questionId: args.questionId, type: args.draft.type },
      output: { missingClaims: missing },
    });
    return { ok: false as const, error: "needs_verification" as const, missingClaims: missing };
  }

  if (args.draft.type === "PRODUCT_UPDATE") {
    // Publish product patch into our demo site.
    const handle = args.draft.slug;
    const product = await prisma.product.findFirst({ where: { customerId: args.customerId, handle } });
    if (!product) {
      return { ok: false as const, error: "product_not_found" as const, handle };
    }
    const existingDraft = await prisma.productPatch.findFirst({
      where: { customerId: args.customerId, productId: product.id, status: "DRAFT" as any },
      orderBy: { updatedAt: "desc" },
    });
    const patch = existingDraft
      ? await prisma.productPatch.update({
          where: { id: existingDraft.id },
          data: {
            status: "PUBLISHED" as any,
            title: `${product.title} verified update`,
            bodyMd: args.draft.content.bodyMarkdown,
            evidence: { factsUsed: args.draft.content.factsUsed, recommendationId: args.recommendationId } as any,
            publishedAt: new Date(),
            updatedAt: new Date(),
          },
        })
      : await prisma.productPatch.create({
          data: {
            customerId: args.customerId,
            productId: product.id,
            status: "PUBLISHED" as any,
            title: `${product.title} verified update`,
            bodyMd: args.draft.content.bodyMarkdown,
            evidence: { factsUsed: args.draft.content.factsUsed, recommendationId: args.recommendationId } as any,
            publishedAt: new Date(),
          },
        });
    const targetUrl = `/site/products/${handle}`;
    await writeReceipt({
      customerId: args.customerId,
      kind: "PUBLISH",
      actor: "CONTENT_ENGINE",
      summary: "Published product update to demo site",
      input: { domain: args.domain, handle, productId: product.id, recommendationId: args.recommendationId },
      output: { productPatchId: patch.id, targetUrl },
    });

    // Optional: publish to Shopify product metafields
    if (args.publishToShopify !== false && isShopifyEnabled()) {
      try {
        const nowIso = new Date().toISOString();
        const verifiedSummary = args.draft.content.shortAnswer || `Verified update for ${product.title}`;
        const verifiedFacts = (args.draft.content.factsUsed || []).join("\n");
        const trustSignals = (args.draft.content.llmEvidence || [])
          .slice(0, 6)
          .map((e) => `${e.provider}: ${e.quote}`.trim())
          .filter(Boolean)
          .join("\n");
        const shopify = await updateProductMetafields({
          productHandle: handle,
          verifiedSummary,
          verifiedFacts,
          trustSignals,
          llmGapFixed: true,
          lastVerifiedAtIso: nowIso,
        });
        await writeReceipt({
          customerId: args.customerId,
          kind: "PUBLISH",
          actor: "DELIVERY",
          summary: "Published product enrichment to Shopify",
          input: { domain: args.domain, recommendationId: args.recommendationId, productHandle: handle },
          output: {
            shopify_object_type: shopify.objectType,
            shopify_id: shopify.shopifyId,
            public_url: shopify.publicUrl,
            metafields_written_count: shopify.metafieldsWrittenCount || 0,
          },
        });
      } catch (err: any) {
        const status = err?.status;
        const body = err?.body;
        await writeReceipt({
          customerId: args.customerId,
          kind: "SUPPRESS",
          actor: "DELIVERY",
          summary: "Shopify product publish failed",
          input: { domain: args.domain, recommendationId: args.recommendationId, productHandle: handle },
          output: { error: String(err?.message || err), status, body },
        });
      }
    }
    return { ok: true as const, targetUrl, assetId: null as any, slug: handle };
  }

  const type =
    args.draft.type === "BLOG"
      ? ("BLOG" as const)
      : args.draft.type === "TRUTH_BLOCK"
        ? ("TRUTH_BLOCK" as const)
        : ("FAQ" as const);
  const slug = args.draft.slug;

  let asset = await prisma.asset.findFirst({
    where: { customerId: args.customerId, type: type as any, slug },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!asset) {
    asset = await prisma.asset.create({
      data: {
        customerId: args.customerId,
        questionId: args.questionId ?? null,
        type: type as any,
        status: "PUBLISHED" as any,
        title: args.draft.title,
        slug,
        meta: { source: "recommendation_publish", placement: args.draft.targetUrl, recommendationId: args.recommendationId } as any,
        versions: { create: { version: 1, content: args.draft.content.bodyMarkdown } },
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  } else {
    asset = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "PUBLISHED" as any,
        title: args.draft.title,
        meta: { ...(asset.meta as any), placement: args.draft.targetUrl, recommendationId: args.recommendationId } as any,
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  }

  const targetUrl = type === "BLOG" ? `/site/blog/${slug}` : "/site/faq";
  await writeReceipt({
    customerId: args.customerId,
    kind: "PUBLISH",
    actor: "CONTENT_ENGINE",
    summary: "Published asset to demo site",
    input: { domain: args.domain, recommendationId: args.recommendationId, assetType: type, slug, questionId: args.questionId },
    output: { assetId: asset.id, targetUrl },
  });

  // Optional Shopify publish
  if (args.publishToShopify !== false && isShopifyEnabled()) {
    try {
      if (type === "FAQ") {
        // Build the canonical FAQ page from all published FAQ assets for this domain.
        const faqs = await prisma.asset.findMany({
          where: { customerId: args.customerId, type: "FAQ" as any, status: "PUBLISHED" as any },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        });
        const htmlBody = `<h1>FAQ</h1>` + faqs
          .map((a) => {
            const content = String(a.versions?.[0]?.content || "");
            return `<section style="margin:16px 0"><h3>${a.title || a.slug}</h3>${content ? `<div style="white-space:pre-wrap">${content}</div>` : ""}</section>`;
          })
          .join("\n");
        const shopify = await upsertFaqPage({ domain: args.domain, htmlBody });
        await writeReceipt({
          customerId: args.customerId,
          kind: "PUBLISH",
          actor: "DELIVERY",
          summary: "Published FAQ to Shopify Page",
          input: { domain: args.domain, recommendationId: args.recommendationId },
          output: { shopify_object_type: shopify.objectType, shopify_id: shopify.shopifyId, public_url: shopify.publicUrl },
        });
      } else if (type === "BLOG") {
        const bodyMarkdown = String(asset.versions?.[0]?.content || args.draft.content.bodyMarkdown || "");
        const existingId = (asset.meta as any)?.shopify?.articleId || null;
        const shopify = await createOrUpdateBlogArticle({ title: args.draft.title, bodyMarkdown, existingArticleId: existingId });
        // Store Shopify IDs for future updates
        await prisma.asset.update({
          where: { id: asset.id },
          data: { meta: { ...(asset.meta as any), shopify: { articleId: shopify.shopifyId, url: shopify.publicUrl } } as any },
        });
        await writeReceipt({
          customerId: args.customerId,
          kind: "PUBLISH",
          actor: "DELIVERY",
          summary: "Published blog article to Shopify",
          input: { domain: args.domain, recommendationId: args.recommendationId, slug },
          output: { shopify_object_type: shopify.objectType, shopify_id: shopify.shopifyId, public_url: shopify.publicUrl },
        });
      }
    } catch (err: any) {
      const status = err?.status;
      const body = err?.body;
      await writeReceipt({
        customerId: args.customerId,
        kind: "SUPPRESS",
        actor: "DELIVERY",
        summary: "Shopify publish failed",
        input: { domain: args.domain, recommendationId: args.recommendationId, assetType: type, slug },
        output: { error: String(err?.message || err), status, body },
      });
    }
  }

  // Resolve question + gaps if applicable.
  if (args.questionId) {
    await prisma.question.updateMany({
      where: { id: args.questionId, customerId: args.customerId },
      data: { state: "ANSWERED" as any },
    });
    await prisma.questionGap.deleteMany({ where: { questionId: args.questionId } });
  }

  return { ok: true as const, targetUrl, assetId: asset.id, slug };
}

