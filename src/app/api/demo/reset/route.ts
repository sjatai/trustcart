import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateContentRecommendations } from "@/lib/recommendations";
import { getCustomerByDomain } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDomain(domainOrUrl: string) {
  const raw = String(domainOrUrl || "").trim();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      return host.startsWith("www.") ? host.slice(4) : host;
    } catch {
      // fall through
    }
  }
  const noProto = raw.replace(/^\/\//, "");
  const hostish = noProto.split("/")[0]?.split("?")[0]?.split("#")[0] || noProto;
  const host = hostish.trim().toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function prefilledDemoFaqDrafts() {
  const storesTitle = "FAQ: Where are your stores in Singapore, and what are the opening hours?";
  const sizeTitle = "FAQ: How do I choose my size? (fit + size conversion)";

  const storesDraftBody = [
    `# ${storesTitle}`,
    ``,
    `SunnyStep has physical stores in Singapore where you can try on shoes in person.`,
    ``,
    `## Where to find store locations`,
    `- Use the store locator to view current locations and details.`,
    ``,
    `## Opening hours`,
    `- Opening hours vary by location. Check the store locator for the latest hours for each store.`,
    ``,
    `Source: https://www.sunnystep.com/pages/frequently-asked-questions`,
  ].join("\n");

  const sizeDraftBody = [
    `# ${sizeTitle}`,
    ``,
    `We recommend checking the size guide for the best fit, as sizing may vary between styles.`,
    ``,
    `## Fit notes`,
    `- Most styles follow the size guide; if you are between sizes, follow the guide’s recommendation.`,
    `- Note: for the Balance Space Runner, consider sizing up by two sizes (per the brand’s guidance).`,
    ``,
    `## Size conversion`,
    `- Refer to the size guide on the site for any available US/EU/UK conversion guidance.`,
    ``,
    `Source: https://www.sunnystep.com/pages/frequently-asked-questions`,
  ].join("\n");

  const mkDraft = (args: { title: string; stableSlug: string; shortAnswer: string; body: string }) => ({
    type: "FAQ",
    title: args.title,
    slug: args.stableSlug,
    targetUrl: "/faq",
    content: {
      shortAnswer: args.shortAnswer,
      bodyMarkdown: args.body.trim() + "\n",
      factsUsed: [],
      needsVerification: [],
      llmEvidence: [{ provider: "SIMULATED", quote: "Prefilled from seeded site facts (no OpenAI required)." }],
    },
  });

  return [
    {
      title: storesTitle,
      stableSlug: "faq-stores-singapore-hours",
      why: "We found the underlying facts in discovery, but shoppers need a single clear FAQ answer.",
      targetUrl: "/faq",
      suggested: storesDraftBody,
      draft: mkDraft({
        title: storesTitle,
        stableSlug: "faq-stores-singapore-hours",
        shortAnswer: "Find SunnyStep stores in Singapore and check store-specific opening hours via the store locator.",
        body: storesDraftBody,
      }),
    },
    {
      title: sizeTitle,
      stableSlug: "faq-size-guide-conversion",
      why: "We found the underlying facts in discovery, but shoppers need a single clear FAQ answer.",
      targetUrl: "/faq",
      suggested: sizeDraftBody,
      draft: mkDraft({
        title: sizeTitle,
        stableSlug: "faq-size-guide-conversion",
        shortAnswer: "Use the size guide; fit may vary by style. Follow the brand’s fit notes and size conversion guidance where provided.",
        body: sizeDraftBody,
      }),
    },
  ];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const domain = normalizeDomain(body?.domain || "");
  const token = String(body?.token || "").trim();

  const expected = String(process.env.DEMO_RESET_TOKEN || "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "reset_not_configured", hint: "Set DEMO_RESET_TOKEN in environment variables." },
      { status: 501 },
    );
  }
  if (!token || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Safety guard: only allow resetting the single demo domain.
  if (domain !== "sunnystep.com") {
    return NextResponse.json({ ok: false, error: "forbidden_domain", domain }, { status: 403 });
  }

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return NextResponse.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  // "Safe reset": remove Trustcart-created demo artifacts while keeping seeded catalog:
  // - keep Products + baseline PUBLISHED FAQ/BLOG assets (questionId = null)
  // - remove ProductPatches, DRAFT assets, and any assets attached to questions (Trustcart-created)
  // - remove Recommendations (we'll regenerate) + Receipts/score snapshots to make demo feel fresh
  const t0 = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.productPatch.deleteMany({ where: { customerId: customer.id } });

    // Delete Trustcart-created assets (those attached to questions) and all draft assets.
    const assetsToDelete = await tx.asset.findMany({
      where: {
        customerId: customer.id,
        OR: [{ status: "DRAFT" as any }, { questionId: { not: null } }],
      } as any,
      select: { id: true },
    });
    const assetIds = assetsToDelete.map((a) => a.id);
    if (assetIds.length) {
      await tx.assetVersion.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.assetEvidence.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
    }

    await tx.contentRecommendation.deleteMany({ where: { customerId: customer.id } });

    await tx.receipt.deleteMany({ where: { customerId: customer.id } });
    await tx.activityEvent.deleteMany({ where: { customerId: customer.id } });
    await tx.visibilityScoreSnapshot.deleteMany({ where: { customerId: customer.id } });
    await tx.trustScoreSnapshot.deleteMany({ where: { customerId: customer.id } });
    await tx.consumerTrustSnapshot.deleteMany({ where: { customerId: customer.id } });
    await tx.probeRun.deleteMany({ where: { customerId: customer.id } });
  });

  // Regenerate baseline recommendations (PROPOSED).
  await generateContentRecommendations(domain);

  // Restore two prefilled demo FAQ drafts as DRAFTED recs + ensure draft assets exist.
  const prefilled = prefilledDemoFaqDrafts();
  for (const r of prefilled) {
    const rec = await prisma.contentRecommendation.create({
      data: {
        customerId: customer.id,
        kind: "CREATE" as any,
        status: "DRAFTED" as any,
        title: r.title,
        why: r.why,
        targetUrl: r.targetUrl,
        suggestedContent: r.suggested,
        recommendedAssetType: "FAQ" as any,
        publishTarget: "FAQ" as any,
        llmEvidence: { stableSlug: r.stableSlug, draft: r.draft } as any,
      } as any,
      select: { id: true },
    });

    const existingAsset = await prisma.asset.findFirst({
      where: { customerId: customer.id, type: "FAQ" as any, slug: r.stableSlug },
      select: { id: true },
    });
    if (!existingAsset) {
      await prisma.asset.create({
        data: {
          customerId: customer.id,
          questionId: null,
          type: "FAQ" as any,
          status: "DRAFT" as any,
          title: r.title,
          slug: r.stableSlug,
          meta: { source: "demo_reset_prefill", placement: "/faq", recommendationId: rec.id } as any,
          versions: { create: { version: 1, content: r.suggested } },
        } as any,
      });
    }
  }

  // Ensure the curated demo blog is always visible immediately after reset
  // (so the storefront /blog and homepage "Community story" are not empty).
  try {
    const curatedTitle = "Comfort science for walking + running: reduce fatigue, recover better";
    const curatedSlug = "comfort-science-walking-running";
    const curatedHero = "/images/blogs/woman_doing_run_walk_method.avif";
    const curatedExcerpt =
      "A practical guide to reducing fatigue and recovering better—using comfort science principles for walking and running.";
    const curatedMd = [
      `# ${curatedTitle}`,
      "",
      curatedExcerpt,
      "",
      "## The simple idea",
      "- Reduce pressure hotspots (heel + forefoot) with stable cushioning and support.",
      "- Keep your gait efficient (less energy loss = less fatigue).",
      "- Recover faster by lowering repetitive stress over long days.",
      "",
      "## Practical checklist",
      "- Choose shoes with stable arch + heel support (especially for long walking/standing).",
      "- If you run or do brisk walks, prioritize consistent cushioning and traction.",
      "- Use the brand’s size guide for the best fit (fit drives comfort more than you think).",
      "",
      "Source: https://www.sunnystep.com/pages/frequently-asked-questions",
      "",
    ].join("\n");

    const existing = await prisma.asset.findFirst({
      where: { customerId: customer.id, type: "BLOG" as any, slug: curatedSlug, status: "PUBLISHED" as any } as any,
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!existing) {
      await prisma.asset.create({
        data: {
          customerId: customer.id,
          type: "BLOG" as any,
          status: "PUBLISHED" as any,
          title: curatedTitle,
          slug: curatedSlug,
          meta: { excerpt: curatedExcerpt, imageUrl: curatedHero, seed: "demo_reset/ensure_curated_blog" } as any,
          versions: { create: [{ version: 1, content: curatedMd }] },
        } as any,
      });
    } else {
      const latestContent = String(existing.versions?.[0]?.content || "");
      const needsNewVersion = latestContent.trim() !== curatedMd.trim();
      const latestVersion = existing.versions?.[0]?.version || 1;
      await prisma.asset.update({
        where: { id: existing.id },
        data: {
          // Touch updatedAt so it stays first in lists.
          title: curatedTitle,
          meta: { ...(typeof existing.meta === "object" && existing.meta ? (existing.meta as any) : {}), excerpt: curatedExcerpt, imageUrl: curatedHero } as any,
          versions: needsNewVersion ? { create: [{ version: latestVersion + 1, content: curatedMd }] } : undefined,
        } as any,
      });
    }
  } catch {
    // ignore: reset should still succeed even if this fails
  }

  return NextResponse.json({
    ok: true,
    domain,
    tookMs: Date.now() - t0,
  });
}

