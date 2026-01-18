/* eslint-disable no-console */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getCustomerByDomain } from "@/lib/domain";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/%[0-9a-f]{2}/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function bestMatch(slug: string, files: string[]) {
  const s = norm(slug);
  let best: { file: string; score: number } | null = null;
  for (const f of files) {
    const base = norm(f.replace(/^\d+_/, "").replace(/_hero\.[^.]+$/, "").replace(/\.[^.]+$/, ""));
    if (!base) continue;
    let score = 0;
    if (s.includes(base)) score += base.length + 10;
    if (base.includes(s)) score += s.length + 8;
    // prefix bonus
    let i = 0;
    while (i < s.length && i < base.length && s[i] === base[i]) i++;
    score += i;
    if (!best || score > best.score) best = { file: f, score };
  }
  return best?.file || files[0] || "";
}

async function main() {
  const domain = String(arg("domain") || "sunnystep.com").trim();
  const customer = await getCustomerByDomain(domain);

  const baseDir = path.join(process.cwd(), "demo_sunnystep", "images", "blogs");
  const files = fs
    .readdirSync(baseDir)
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .sort();

  if (!files.length) throw new Error(`No blog images found under ${baseDir}`);

  const assets = await prisma.asset.findMany({
    where: { customerId: customer.id, type: "BLOG" as any },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  for (const a of assets) {
    const meta: any = (a as any).meta || {};
    const current = String(meta?.imageUrl || "").trim();
    // If we already have an imageUrl but it's in the old (incorrect) location, rewrite it.
    if (current && current.startsWith("blogs/")) {
      const imageUrl = `images/${current}`;
      await prisma.asset.update({
        where: { id: a.id },
        data: { meta: { ...(meta || {}), imageUrl } as any },
      });
      updated += 1;
      continue;
    }
    if (current) continue;

    const pick = bestMatch(String(a.slug || ""), files);
    if (!pick) continue;
    const imageUrl = `images/blogs/${pick}`;
    await prisma.asset.update({
      where: { id: a.id },
      data: { meta: { ...(meta || {}), imageUrl } as any },
    });
    updated += 1;
  }

  console.log("✅ backfilled blog images", { domain: customer.domain, totalBlogs: assets.length, updated });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

