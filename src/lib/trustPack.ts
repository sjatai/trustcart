/**
 * NOTE (2026-01): This module is legacy-named. It does NOT compute “System Trust”.
 * - System Trust (execution readiness + policy gates) lives in: src/lib/agents/trust.ts
 * - This file only drafts/publishes consumer-facing VERIFIED ANSWERS (Assets + Evidence).
 *
 * TODO: Consider renaming to verifiedAnswers.ts in a later refactor; for now we keep this file
 * to avoid breaking existing imports.
 */
import { prisma } from "@/lib/db";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
}

function draftContentFor(type: string, question: string, claims: Record<string, string>) {
  if (type === "FAQ") {
    return `Q: ${question}\n\nA: ${claims["phone.primary"] ? `Call ${claims["phone.primary"]}. ` : ""}Here is a verified answer based on current facts and evidence. (Draft — requires approval.)`;
  }
  if (type === "BLOG") {
    return `# ${question}\n\nVerified Answer draft (requires approval).\n\n## What we know\n- Hours: ${claims["hours.summary"] || "TBD"}\n- Phone: ${claims["phone.primary"] || "TBD"}\n\n## Answer\nWrite a clear, evidence-backed explanation here.\n`;
  }
  // TRUTH_BLOCK
  return `Verified Answer Block (Draft — requires approval)\n\nQuestion: ${question}\n\nVerified facts:\n- Hours: ${claims["hours.summary"] || "TBD"}\n- Phone: ${claims["phone.primary"] || "TBD"}\n\nNext step: Provide the shortest safe action to take.\n`;
}

export async function generateTrustPackDrafts(customerId: string) {
  const questions = await prisma.question.findMany({
    where: { customerId, state: { in: ["UNANSWERED", "WEAK"] } },
    orderBy: { impactScore: "desc" },
    take: 5,
  });

  const claims = await prisma.claim.findMany({ where: { customerId } });
  const claimMap: Record<string, string> = {};
  const claimIds: string[] = [];
  for (const c of claims) {
    claimMap[c.key] = c.value;
    claimIds.push(c.id);
  }

  const created: { id: string; type: string; status: string; title: string; slug: string | null }[] = [];

  for (const q of questions) {
    const type = String(q.recommendedAssetType);
    const title = q.text;
    const slug = type === "BLOG" ? slugify(title) : null;

    const ev = await prisma.evidence.findMany({
      where: { claimId: { in: claimIds } },
      orderBy: { capturedAt: "desc" },
      take: 3,
    });

    const assetData: any = {
      customerId,
      type: type as any,
      status: "DRAFT",
      title,
      slug,
      questionId: q.id,
      meta: { taxonomy: q.taxonomy, source: "verified_answers" } as any,
      versions: {
        create: {
          version: 1,
          content: draftContentFor(type, q.text, claimMap),
        },
      },
    };

    if (ev.length > 0) {
      assetData.assetEvidence = {
        create: ev.map((e) => ({
          url: e.url,
          snippet: e.snippet,
          weight: 60,
          meta: { claimId: e.claimId, capturedAt: e.capturedAt } as any,
        })),
      };
    }

    const asset = await prisma.asset.create({
      data: assetData,
    });

    created.push({ id: asset.id, type: asset.type, status: asset.status, title: asset.title || "", slug: asset.slug });
  }

  return created;
}

export async function approveAndPublishTopDrafts(customerId: string) {
  const drafts = await prisma.asset.findMany({
    where: { customerId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const toPublish = drafts.slice(0, 5);
  const published: string[] = [];
  const publishedSlugs: string[] = [];

  for (const a of toPublish) {
    await prisma.asset.update({ where: { id: a.id }, data: { status: "PUBLISHED" } });
    published.push(a.id);
    if (a.slug) {
      publishedSlugs.push(a.slug);
    }
  }

  return { publishedAssetIds: published, publishedSlugs, count: published.length };
}

// Preferred names going forward (same behavior)
export const generateVerifiedAnswerDrafts = generateTrustPackDrafts;
export const approveAndPublishVerifiedAnswers = approveAndPublishTopDrafts;
