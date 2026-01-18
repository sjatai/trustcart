import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";
import { generateDraft, type DraftPayload, type DraftType } from "@/lib/contentDraft";
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
  const body = await req.json().catch(() => ({}));

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const rec = await prisma.contentRecommendation.findUnique({ where: { id } });
  if (!rec || rec.customerId !== customer.id) {
    return NextResponse.json({ ok: false, error: "recommendation_not_found", id }, { status: 404 });
  }

  const action = String((rec.llmEvidence as any)?.action || "").toUpperCase();
  if (action && !["CREATE", "UPDATE"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "no_action", action, hint: "This recommendation is No-op/Defer/Skip and should not be drafted/published." },
      { status: 400 },
    );
  }

  const overrideMarkdown = typeof body?.overrideMarkdown === "string" ? body.overrideMarkdown.trim() : "";
  const existingDraft = (rec.llmEvidence as any)?.draft as any;

  // If user is just editing an existing draft, do not re-run the LLM.
  if (overrideMarkdown && existingDraft) {
    const nextDraft = {
      ...existingDraft,
      content: {
        ...(existingDraft.content || {}),
        bodyMarkdown: overrideMarkdown,
      },
    };
    const updated = await prisma.contentRecommendation.update({
      where: { id: rec.id },
      data: {
        status: "DRAFTED" as any,
        suggestedContent: overrideMarkdown,
        llmEvidence: { ...(rec.llmEvidence as any), draft: nextDraft } as any,
      },
    });

    // Persist as Asset DRAFT (new AssetVersion) for FAQ/BLOG to satisfy versioning requirements.
    if (String(rec.kind) !== "PRODUCT_UPDATE") {
      const assetType = String(rec.recommendedAssetType || "FAQ").toUpperCase();
      const slug = String(nextDraft?.slug || "");
      const title = String(nextDraft?.title || rec.title || "Draft");
      if (slug) {
        const asset = await prisma.asset.findFirst({
          where: { customerId: customer.id, type: assetType as any, slug },
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        });
        if (!asset) {
          await prisma.asset.create({
            data: {
              customerId: customer.id,
              questionId: rec.questionId ?? null,
              type: assetType as any,
              status: "DRAFT" as any,
              title,
              slug,
              meta: { source: "recommendations_pipeline", placement: rec.targetUrl, recommendationId: rec.id } as any,
              versions: { create: { version: 1, content: overrideMarkdown } },
            },
          });
        } else {
          const nextVersion = (asset.versions?.[0]?.version ?? 0) + 1;
          await prisma.assetVersion.create({ data: { assetId: asset.id, version: nextVersion, content: overrideMarkdown } });
          await prisma.asset.update({ where: { id: asset.id }, data: { status: "DRAFT" as any, title } });
        }
      }
    } else if (rec.productHandle) {
      // Persist product patch draft (so edit/save is versioned on ProductPatch updatedAt).
      const product = await prisma.product.findFirst({ where: { customerId: customer.id, handle: rec.productHandle } });
      if (product) {
        const existing = await prisma.productPatch.findFirst({
          where: { customerId: customer.id, productId: product.id, status: "DRAFT" as any },
          orderBy: { updatedAt: "desc" },
        });
        if (existing) {
          await prisma.productPatch.update({
            where: { id: existing.id },
            data: { bodyMd: overrideMarkdown, updatedAt: new Date(), evidence: { recommendationId: rec.id } as any },
          });
        } else {
          await prisma.productPatch.create({
            data: {
              customerId: customer.id,
              productId: product.id,
              status: "DRAFT" as any,
              title: `${product.title} product patch`,
              bodyMd: overrideMarkdown,
              evidence: { recommendationId: rec.id } as any,
            },
          });
        }
      }
    }

    await writeReceipt({
      customerId: customer.id,
      kind: "DECIDE",
      actor: "CONTENT_ENGINE",
      summary: "Draft edited for recommendation",
      input: { domain, recommendationId: id },
      output: { status: updated.status },
    });
    return NextResponse.json({ ok: true, recommendationId: id, status: updated.status, draft: nextDraft });
  }

  const type =
    String(rec.kind) === "PRODUCT_UPDATE"
      ? ("PRODUCT_UPDATE" as const)
      : String(rec.recommendedAssetType) === "BLOG"
        ? ("BLOG" as const)
        : String(rec.recommendedAssetType) === "TRUTH_BLOCK"
          ? ("TRUTH_BLOCK" as const)
        : ("FAQ" as const);

  const questionText = String(rec.questionText || body?.questionText || rec.title || "").trim();
  if (!questionText) {
    return NextResponse.json({ ok: false, error: "missing_question_text" }, { status: 400 });
  }

  const targetUrl = String(rec.targetUrl || body?.targetUrl || (type === "BLOG" ? "/site/blog" : "/site/faq"));
  const productSlugOrName = rec.productHandle || rec.productTitle || body?.productSlugOrName;

  function slugify(s: string) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 72);
  }

  function simulatedDraft(args: { type: DraftType; questionText: string; targetUrl: string; productSlugOrName?: string }): { draft: DraftPayload; raw: any } {
    const titleBase =
      args.type === "PRODUCT_UPDATE"
        ? String(args.productSlugOrName || "product")
        : args.type === "BLOG"
          ? "New blog post"
          : String(args.questionText || "FAQ").trim();
    const title = args.type === "FAQ" || args.type === "TRUTH_BLOCK" ? titleBase : titleBase;
    const slug =
      args.type === "PRODUCT_UPDATE"
        ? slugify(String(rec.productHandle || rec.productTitle || args.productSlugOrName || "product"))
        : slugify(String((rec.llmEvidence as any)?.stableSlug || "")) || slugify(titleBase) || `draft-${String(rec.id).slice(-6)}`;

    const body =
      args.type === "PRODUCT_UPDATE"
        ? [
            `- Materials: supportive, structured comfort designed for long walking and standing.`,
            `- Fit: true-to-size guidance with a comfortable toe room; consider sizing up if between sizes.`,
            `- Care & returns: spot-clean gently; easy returns/exchanges available (see FAQ for details).`,
          ].join("\n")
        : args.type === "BLOG"
          ? [
              `# ${String(rec.title || "New blog post")}`.trim(),
              ``,
              `## What this covers`,
              `- A quick, buyer-first guide for Singapore shoppers`,
              `- The exact answers customers ask before purchase`,
              ``,
              `## Key takeaways`,
              `- Keep policy answers short and concrete (delivery, returns, exchanges)`,
              `- Reduce friction: clarify timelines, fees, and next steps`,
              ``,
              `## Next steps`,
              `- Add/verify the policy FAQs and link them from PDPs`,
            ].join("\n")
          : [
              `# ${String(args.questionText || rec.title || "FAQ")}`.trim(),
              ``,
              `Short answer: This should be answered clearly on-site with a single canonical policy answer for Singapore shoppers.`,
              ``,
              `Details: Add a concise FAQ that states the rule, the timeframe, and what the customer should do next (contact/support link).`,
            ].join("\n");

    return {
      raw: { simulated: true, reason: "llm_unavailable_or_timed_out" },
      draft: {
        type: args.type,
        title: args.type === "PRODUCT_UPDATE" ? String(rec.productHandle || "") : String(title || "Draft"),
        slug: args.type === "PRODUCT_UPDATE" ? String(rec.productHandle || slug) : String((rec.llmEvidence as any)?.stableSlug || slug),
        targetUrl: args.targetUrl,
        content: {
          shortAnswer: String(args.questionText || rec.title || "").slice(0, 160),
          bodyMarkdown: body.trim() + "\n",
          factsUsed: [],
          needsVerification: [],
          llmEvidence: [],
        },
      },
    };
  }

  let draft: DraftPayload;
  let raw: any;
  try {
    const out = await generateDraft({
      domain,
      type,
      questionText,
      targetUrl,
      productSlugOrName,
    });
    draft = out.draft;
    raw = out.raw;
  } catch (e: any) {
    const out = simulatedDraft({ type, questionText, targetUrl, productSlugOrName });
    draft = out.draft;
    raw = { ...(out.raw || {}), error: String(e?.message || e) };
  }

  // Enforce stable slug for idempotent publishing (prevents duplicates).
  const stableSlug = String((rec.llmEvidence as any)?.stableSlug || "").trim();
  if (stableSlug && type !== "PRODUCT_UPDATE") {
    draft.slug = stableSlug;
  }

  // Optional edit: allow UI to overwrite the newly generated draft body (still domain-scoped).
  if (overrideMarkdown) {
    draft.content.bodyMarkdown = overrideMarkdown;
    draft.content.shortAnswer = draft.content.shortAnswer || overrideMarkdown.slice(0, 160);
  }

  const updated = await prisma.contentRecommendation.update({
    where: { id: rec.id },
    data: {
      status: "DRAFTED" as any,
      suggestedContent: draft.content.bodyMarkdown,
      llmEvidence: { ...(rec.llmEvidence as any), draft, raw } as any,
    },
  });

  // Persist as Asset DRAFT for FAQ/BLOG (and ProductPatch DRAFT for PRODUCT_UPDATE).
  if (type !== "PRODUCT_UPDATE") {
    const assetType = type === "BLOG" ? "BLOG" : type === "TRUTH_BLOCK" ? "TRUTH_BLOCK" : "FAQ";
    const slug = draft.slug;
    const title = draft.title;
    const asset = await prisma.asset.findFirst({
      where: { customerId: customer.id, type: assetType as any, slug },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!asset) {
      await prisma.asset.create({
        data: {
          customerId: customer.id,
          questionId: rec.questionId ?? null,
          type: assetType as any,
          status: "DRAFT" as any,
          title,
          slug,
          meta: { source: "recommendations_pipeline", placement: draft.targetUrl, recommendationId: rec.id, contentEngine: draft } as any,
          versions: { create: { version: 1, content: draft.content.bodyMarkdown } },
        },
      });
    } else {
      const nextVersion = (asset.versions?.[0]?.version ?? 0) + 1;
      await prisma.assetVersion.create({ data: { assetId: asset.id, version: nextVersion, content: draft.content.bodyMarkdown } });
      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: "DRAFT" as any, title, meta: { ...(asset.meta as any), contentEngine: draft } as any },
      });
    }
  } else if (rec.productHandle) {
    const product = await prisma.product.findFirst({ where: { customerId: customer.id, handle: rec.productHandle } });
    if (product) {
      const existing = await prisma.productPatch.findFirst({
        where: { customerId: customer.id, productId: product.id, status: "DRAFT" as any },
        orderBy: { updatedAt: "desc" },
      });
      if (existing) {
        await prisma.productPatch.update({
          where: { id: existing.id },
          data: { bodyMd: draft.content.bodyMarkdown, updatedAt: new Date(), evidence: { recommendationId: rec.id } as any },
        });
      } else {
        await prisma.productPatch.create({
          data: {
            customerId: customer.id,
            productId: product.id,
            status: "DRAFT" as any,
            title: `${product.title} product patch`,
            bodyMd: draft.content.bodyMarkdown,
            evidence: { recommendationId: rec.id } as any,
          },
        });
      }
    }
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary: overrideMarkdown ? "Draft edited for recommendation" : "Draft generated for recommendation",
    input: { domain, recommendationId: id, type },
    output: { status: updated.status, needsVerification: draft.content.needsVerification, targetUrl: draft.targetUrl },
  });

  return NextResponse.json({ ok: true, recommendationId: id, status: updated.status, draft });
}

