import { prisma } from "@/lib/db";

export const STORE_DOMAIN = "sunnystep.com";

function pickLatestVersion(asset: any): string {
  const versions = Array.isArray(asset?.versions) ? asset.versions : [];
  if (!versions.length) return "";
  const sorted = [...versions].sort((a: any, b: any) => (b.version ?? 0) - (a.version ?? 0));
  return String(sorted[0]?.content || "");
}

export function parseMarkdownHeading(md: string): { title: string; body: string } {
  const s = String(md || "").trim();
  const lines = s.split("\n");
  if (lines[0]?.startsWith("# ")) {
    const title = lines[0].slice(2).trim();
    const body = lines.slice(1).join("\n").trim();
    return { title, body };
  }
  return { title: "", body: s };
}

export async function getStoreProducts(domain = STORE_DOMAIN, limit = 20) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return [];
  return prisma.product.findMany({
    where: { customerId: customer.id },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function getStoreProduct(domain = STORE_DOMAIN, handle: string) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return null;
  return prisma.product.findUnique({
    where: { customerId_handle: { customerId: customer.id, handle } as any },
    include: { patches: { orderBy: { updatedAt: "desc" }, take: 4 } },
  } as any);
}

export async function getStoreBlogAssets(domain = STORE_DOMAIN, limit = 40) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return [];
  return prisma.asset.findMany({
    where: { customerId: customer.id, type: "BLOG" as any, status: "PUBLISHED" as any },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
}

export async function getStoreBlogAsset(domain = STORE_DOMAIN, slug: string) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return null;
  return prisma.asset.findFirst({
    where: { customerId: customer.id, type: "BLOG" as any, slug, status: "PUBLISHED" as any },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
}

export async function getStoreFaqAssets(domain = STORE_DOMAIN, limit = 80) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return [];
  return prisma.asset.findMany({
    where: { customerId: customer.id, type: "FAQ" as any, status: "PUBLISHED" as any },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
}

export async function getActiveRecommendations(domain = STORE_DOMAIN) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return [];
  return prisma.contentRecommendation.findMany({
    where: { customerId: customer.id, status: { in: ["PROPOSED", "DRAFTED", "APPROVED"] as any } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export function getAssetMarkdown(asset: any): string {
  return pickLatestVersion(asset);
}

