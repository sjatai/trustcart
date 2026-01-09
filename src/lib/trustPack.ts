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
    return `Q: ${question}\n\nA: ${claims["phone.primary"] ? `Call ${claims["phone.primary"]}. ` : ""}Here is the verified answer based on current facts. (Draft — requires approval.)`;
  }
  if (type === "BLOG") {
    return `# ${question}\n\nTrustEye draft (requires approval).\n\n## What we know\n- Hours: ${claims["hours.summary"] || "TBD"}\n- Phone: ${claims["phone.primary"] || "TBD"}\n\n## Answer\nWrite a clear, evidence-backed explanation here.\n`;
  }
  // TRUTH_BLOCK
  return `Truth Block (Draft — requires approval)\n\nQuestion: ${question}\n\nVerified facts:\n- Hours: ${claims["hours.summary"] || "TBD"}\n- Phone: ${claims["phone.primary"] || "TBD"}\n\nNext step: Provide the shortest safe action to take.\n`;
}

export async function generateTrustPackDrafts(customerId: string) {
  const questions = await prisma.question.findMany({
    where: { customerId, state: { in: ["UNANSWERED", "WEAK"] } },
    orderBy: { impactScore: "desc" },
    take: 5,
  });

  const claims = await prisma.claim.findMany({ where: { customerId } });
  const claimMap: Record<string, string> = {};
  for (const c of claims) claimMap[c.key] = c.value;

  const created: { id: string; type: string; status: string; title: string; slug: string | null }[] = [];

  for (const q of questions) {
    const type = String(q.recommendedAssetType);
    const title = q.text;
    const slug = type === "BLOG" ? slugify(title) : null;

    const asset = await prisma.asset.create({
      data: {
        customerId,
        type: type as any,
        status: "DRAFT",
        title,
        slug,
        meta: { questionId: q.id, taxonomy: q.taxonomy, source: "trust_pack" } as any,
        versions: {
          create: {
            version: 1,
            content: draftContentFor(type, q.text, claimMap),
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
  });

  const toPublish = drafts.slice(0, 5);
  const published: string[] = [];

  for (const a of toPublish) {
    await prisma.asset.update({ where: { id: a.id }, data: { status: "PUBLISHED" } });
    published.push(a.id);
  }

  return { publishedAssetIds: published, count: published.length };
}


