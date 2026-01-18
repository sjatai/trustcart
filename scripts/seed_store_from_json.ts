/* eslint-disable no-console */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { writeReceipt } from "@/lib/receipts";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function shortHash(input: string) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).slice(0, 8);
}

function excerpt(text: string, max = 180) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trim() + "…" : t;
}

type SeedFile = {
  source?: string;
  capturedAt?: string;
  products?: Array<{
    handle: string;
    title: string;
    description?: string;
    price?: string;
    currency?: string;
    images?: string[];
    sourceUrl?: string;
  }>;
  blogs?: Array<{
    slug: string;
    title: string;
    body: string;
    imageUrl?: string;
    sourceUrl?: string;
  }>;
  faqs?: Array<{
    question: string;
    answer: string;
    sourceUrl?: string;
  }>;
};

async function main() {
  const domain = String(arg("domain") || process.env.TRUSTEYE_DOMAIN || "sunnystep.com").trim();
  const file = String(arg("file") || "data/sunnystep_seed.json");
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const raw = fs.readFileSync(abs, "utf8");
  const data = JSON.parse(raw) as SeedFile;

  const customer = await getOrCreateCustomerByDomain(domain);
  console.log("[seed_store_from_json]", { domain: customer.domain, customerId: customer.id, file: abs });

  let productCreated = 0;
  let blogCreated = 0;
  let faqCreated = 0;

  for (const p of data.products || []) {
    const handle = slugify(p.handle);
    if (!handle) continue;
    const exists = await prisma.product.findFirst({ where: { customerId: customer.id, handle } });
    if (exists) continue;

    const priceNum = Number(String(p.price || "").trim());
    const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : null;

    await prisma.product.create({
      data: {
        customerId: customer.id,
        handle,
        title: String(p.title || handle).trim(),
        vendor: "Sunnystep",
        tags: "browser_seed",
        priceMin: priceCents ?? undefined,
        priceMax: priceCents ?? undefined,
        currency: String(p.currency || "SGD").trim() || "SGD",
        images: Array.isArray(p.images) ? p.images : undefined,
        descriptionHtml: `<p>${String(p.description || "").replace(/\s+/g, " ").trim()}</p>`,
        specs: { sourceUrl: p.sourceUrl || `https://www.sunnystep.com/products/${handle}`, seed: "browser" } as any,
      },
    });
    productCreated += 1;
  }

  for (const b of data.blogs || []) {
    const slug = slugify(b.slug || b.title);
    if (!slug) continue;
    const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "BLOG" as any, slug } });
    if (exists) continue;
    const body = String(b.body || "").trim();
    await prisma.asset.create({
      data: {
        customerId: customer.id,
        type: "BLOG" as any,
        status: "PUBLISHED" as any,
        title: String(b.title || "Blog").trim(),
        slug,
        meta: { source: "browser_seed", url: b.sourceUrl || null, imageUrl: b.imageUrl || "", excerpt: excerpt(body, 220) } as any,
        versions: { create: { version: 1, content: `# ${String(b.title || "Blog").trim()}\n\n${body}\n` } },
      },
    });
    blogCreated += 1;
  }

  for (const f of data.faqs || []) {
    const q = String(f.question || "").trim();
    const a = String(f.answer || "").trim();
    if (!q || !a) continue;

    const slugBase = `faq-${slugify(q).slice(0, 48)}`;
    const slug = `${slugBase}-${shortHash(`${q}|${f.sourceUrl || ""}`)}`;
    const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "FAQ" as any, slug } });
    if (exists) continue;
    await prisma.asset.create({
      data: {
        customerId: customer.id,
        type: "FAQ" as any,
        status: "PUBLISHED" as any,
        title: q,
        slug,
        meta: { source: "browser_seed", url: f.sourceUrl || "" } as any,
        versions: { create: { version: 1, content: `# ${q}\n\n${a}\n` } },
      },
    });
    faqCreated += 1;
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "ORCHESTRATOR",
    summary: "Seeded store inventory (products/blog/faq) from browser-exported JSON",
    input: { domain, file: abs, source: data.source || null, capturedAt: data.capturedAt || null },
    output: { productCreated, blogCreated, faqCreated },
  });

  console.log("✅ seeded store from json", { domain, productCreated, blogCreated, faqCreated });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

