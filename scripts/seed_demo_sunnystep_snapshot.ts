/* eslint-disable no-console */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { writeReceipt } from "@/lib/receipts";

type Snapshot = {
  domain: string;
  products: Array<{
    handle: string;
    title: string;
    vendor?: string;
    productType?: string;
    tags?: string[] | string;
    descriptionHtml?: string;
    specs?: any;
  }>;
  faq: Array<{ question: string; answer: string }>;
  blogs: Array<{ slug: string; title: string; bodyMarkdown: string }>;
};

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function toTags(tags: any): string {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.map(String).join(",");
  return String(tags);
}

async function main() {
  const file = arg("file") || path.join(process.cwd(), "scripts/demo_sunnystep/snapshot.json");
  const raw = fs.readFileSync(file, "utf8");
  const snap = JSON.parse(raw) as Snapshot;
  const domain = String(arg("domain") || snap.domain || "sunnysteps.com").trim();

  const customer = await getOrCreateCustomerByDomain(domain);

  let products = 0;
  for (const p of snap.products || []) {
    const handle = String(p.handle || "").trim();
    if (!handle) continue;
    const exists = await prisma.product.findFirst({ where: { customerId: customer.id, handle } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        customerId: customer.id,
        handle,
        title: String(p.title || handle),
        vendor: p.vendor ? String(p.vendor) : undefined,
        productType: p.productType ? String(p.productType) : undefined,
        tags: toTags(p.tags),
        descriptionHtml: p.descriptionHtml ? String(p.descriptionHtml) : undefined,
        specs: p.specs ?? undefined,
      },
    });
    products += 1;
  }

  let faq = 0;
  for (const item of snap.faq || []) {
    const question = String(item.question || "").trim();
    const answer = String(item.answer || "").trim();
    if (!question || !answer) continue;
    const slug = "faq-" + question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "FAQ" as any, slug } });
    if (exists) continue;
    await prisma.asset.create({
      data: {
        customerId: customer.id,
        type: "FAQ" as any,
        status: "PUBLISHED" as any,
        title: question,
        slug,
        meta: { source: "demo_sunnystep_snapshot" } as any,
        versions: { create: { version: 1, content: `Q: ${question}\n\nA: ${answer}\n` } },
      },
    });
    faq += 1;
  }

  let blogs = 0;
  for (const b of snap.blogs || []) {
    const slug = String(b.slug || "").trim();
    if (!slug) continue;
    const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "BLOG" as any, slug } });
    if (exists) continue;
    const title = String(b.title || slug);
    const body = String(b.bodyMarkdown || "").trim();
    await prisma.asset.create({
      data: {
        customerId: customer.id,
        type: "BLOG" as any,
        status: "PUBLISHED" as any,
        title,
        slug,
        meta: { source: "demo_sunnystep_snapshot" } as any,
        versions: { create: { version: 1, content: `# ${title}\n\n${body}\n` } },
      },
    });
    blogs += 1;
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "ORCHESTRATOR",
    summary: "Seeded demo_sunnystep snapshot content",
    input: { domain, file },
    output: { products, faq, blogs },
  });

  console.log("✅ seeded snapshot", { domain: customer.domain, products, faq, blogs });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

