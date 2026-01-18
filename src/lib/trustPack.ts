import { prisma } from "@/lib/db";
import { extractNeedsVerificationMarkers } from "@/lib/contentSafety";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
}

function draftContentFor(args: {
  type: string;
  question: string;
  evidenceBlocks: Array<{ url: string; snippet?: string | null }>;
}) {
  const evidence = args.evidenceBlocks
    .slice(0, 5)
    .map((e) => `- ${e.url}${e.snippet ? ` — ${e.snippet}` : ""}`)
    .join("\n");
  const evidenceSection = evidence ? `\n\nEvidence:\n${evidence}\n` : `\n\nEvidence:\n- (no evidence blocks attached yet)\n`;

  if (args.type === "FAQ") {
    return `Q: ${args.question}\n\nA: [NEEDS_VERIFICATION: Provide verified claims + evidence-backed answer for this question]\n\n(This draft requires approval. Replace NEEDS_VERIFICATION markers before publishing.)${evidenceSection}`;
  }
  if (args.type === "BLOG") {
    return `# ${args.question}\n\nTrustEye draft (requires approval).\n\n[NEEDS_VERIFICATION: Provide verified claims, proof URLs, and an evidence-backed blog draft]\n\n## Evidence\n${evidence || "- (no evidence blocks attached yet)"}\n\n## Draft\nWrite a clear, evidence-backed explanation here.\n`;
  }
  // TRUTH_BLOCK
  return `Truth Block (Draft — requires approval)\n\nQuestion: ${args.question}\n\nDraft:\n- [NEEDS_VERIFICATION: Provide verified, evidence-backed guidance]\n${evidenceSection}`;
}

export async function generateTrustPackDrafts(customerId: string) {
  const questions = await prisma.question.findMany({
    where: { customerId, state: { in: ["UNANSWERED", "WEAK"] } },
    orderBy: { impactScore: "desc" },
    take: 5,
  });

  // Pull recent evidence blocks to attach to assets (no fabrication).
  const recentEvidence = await prisma.evidence.findMany({
    where: { claim: { customerId } },
    orderBy: { capturedAt: "desc" },
    take: 80,
  });

  const created: { id: string; type: string; status: string; title: string; slug: string | null }[] = [];

  for (const q of questions) {
    const type = String(q.recommendedAssetType);
    const title = q.text;
    const slug = type === "BLOG" ? slugify(title) : null;

    const evidenceBlocks = recentEvidence.slice(0, 8).map((e: { url: string; snippet: string | null }) => ({
      url: e.url,
      snippet: e.snippet,
    }));

    const asset = await prisma.asset.create({
      data: {
        customerId,
        questionId: q.id,
        type: type as any,
        status: "DRAFT",
        title,
        slug,
        meta: { questionId: q.id, taxonomy: q.taxonomy, source: "trust_pack" } as any,
        assetEvidence: {
          create: evidenceBlocks.slice(0, 5).map((e: { url: string; snippet?: string | null }) => ({
            url: e.url,
            snippet: e.snippet ?? null,
            weight: 70,
          })),
        },
        versions: {
          create: {
            version: 1,
            content: draftContentFor({ type, question: q.text, evidenceBlocks }),
          },
        },
      },
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
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const toPublish = drafts.slice(0, 2);
  const published: string[] = [];
  const blocked: Array<{ assetId: string; needsVerification: string[] }> = [];

  for (const a of toPublish) {
    const latest = (a as any)?.versions?.[0]?.content || "";
    const needsVerification = extractNeedsVerificationMarkers(latest);
    if (needsVerification.length) {
      blocked.push({ assetId: a.id, needsVerification });
      continue;
    }
    await prisma.asset.update({ where: { id: a.id }, data: { status: "APPROVED" } });
    await prisma.asset.update({ where: { id: a.id }, data: { status: "PUBLISHED" } });
    published.push(a.id);
  }

  return { publishedAssetIds: published, blocked, count: published.length };
}


