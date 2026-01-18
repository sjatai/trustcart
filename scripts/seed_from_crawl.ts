/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getCustomerByDomain } from "@/lib/domain";
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

function extractFirstH1(text: string) {
  const m = String(text || "").match(/^\s*#\s+(.+)\s*$/m);
  if (m?.[1]) return m[1].trim();
  return "";
}

function looksLikeBlog(url: string) {
  return /\/blog(\/|$)/i.test(url);
}

function looksLikeProduct(url: string) {
  return /\/products?(\/|$)/i.test(url);
}

function looksLikeFaq(url: string) {
  return /\/faq(\/|$)/i.test(url);
}

function cleanBody(text: string) {
  const t = String(text || "").trim();
  // keep it simple: avoid importing huge pages
  const max = 12000;
  return t.length > max ? t.slice(0, max) + "\n\n(…truncated)\n" : t;
}

function extractJsonLd(html?: string | null): any[] {
  const h = String(html || "");
  if (!h) return [];
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h))) {
    const raw = String(m[1] || "").trim();
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) out.push(...json);
      else out.push(json);
    } catch {
      // ignore malformed ld+json blocks
    }
  }
  // Expand @graph if present
  const expanded: any[] = [];
  for (const j of out) {
    if (j && typeof j === "object" && Array.isArray((j as any)["@graph"])) {
      expanded.push(...((j as any)["@graph"] as any[]));
    } else {
      expanded.push(j);
    }
  }
  return expanded.filter(Boolean);
}

function findSchema<T = any>(nodes: any[], types: string[]): T[] {
  const want = new Set(types.map((t) => t.toLowerCase()));
  const matches: any[] = [];
  for (const n of nodes) {
    const t = (n as any)?.["@type"];
    const list = Array.isArray(t) ? t : t ? [t] : [];
    for (const item of list) {
      if (want.has(String(item).toLowerCase())) {
        matches.push(n);
        break;
      }
    }
  }
  return matches as T[];
}

function shortHash(input: string) {
  // Deterministic, dependency-free, short-ish hash for stable slugs.
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).slice(0, 8);
}

async function main() {
  const domain = String(arg("domain") || process.env.TRUSTEYE_DOMAIN || "sunnysteps.com").trim();
  const limit = Number(arg("limit") || "25");
  const blogLimit = Number(arg("blogs") || "25");
  const productLimit = Number(arg("products") || "20");

  const customer = await getCustomerByDomain(domain);
  const crawlRun = await prisma.crawlRun.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { pages: true },
  });
  if (!crawlRun) throw new Error(`no_crawl_run_for_domain:${domain}`);

  const pages = (crawlRun.pages || [])
    .filter((p) => p.statusCode && p.statusCode >= 200 && p.statusCode < 400)
    .slice(0, Math.max(1, Math.min(200, limit)));

  let blogCreated = 0;
  let faqItemsCreated = 0;
  let productCreated = 0;

  // BLOG: create published blog assets from /blog pages
  const blogPages = pages.filter((p) => looksLikeBlog(p.url));
  for (const p of blogPages.slice(0, blogLimit)) {
    const nodes = extractJsonLd(p.html);
    const posts = findSchema(nodes, ["BlogPosting", "Article", "NewsArticle"]);
    const picked = posts[0] as any;
    const rawBody = String(picked?.articleBody || picked?.text || p.text || "").trim();
    const raw = cleanBody(rawBody || p.text || p.title || "");
    const title = String(picked?.headline || picked?.name || p.title || extractFirstH1(raw) || "Blog").trim();
    const slug = slugify(new URL(p.url).pathname.split("/").filter(Boolean).pop() || title);
    if (!slug) continue;

    const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "BLOG" as any, slug } });
    if (exists) continue;

    await prisma.asset.create({
      data: {
        customerId: customer.id,
        type: "BLOG" as any,
        status: "PUBLISHED" as any,
        title,
        slug,
        meta: { source: "crawl_seed", url: p.url } as any,
        versions: { create: { version: 1, content: `# ${title}\n\n${raw}\n` } },
      },
    });
    blogCreated += 1;
  }

  // FAQ: create published FAQ assets per question from FAQPage schema (preferred).
  // This yields a structured FAQ list instead of a single blob.
  const faqPages = pages.filter((p) => looksLikeFaq(p.url));
  for (const fp of faqPages.slice(0, 3)) {
    const nodes = extractJsonLd(fp.html);
    const faqSchemas = findSchema(nodes, ["FAQPage"]);
    for (const schema of faqSchemas as any[]) {
      const entities: any[] = Array.isArray(schema?.mainEntity) ? schema.mainEntity : [];
      for (const ent of entities) {
        const q = String(ent?.name || ent?.headline || "").trim();
        const a = String(ent?.acceptedAnswer?.text || ent?.acceptedAnswer?.answerText || "").trim();
        if (!q || !a) continue;

        const slugBase = `faq-${slugify(q).slice(0, 48)}`;
        const slug = `${slugBase}-${shortHash(`${q}|${fp.url}`)}`;

        const exists = await prisma.asset.findFirst({ where: { customerId: customer.id, type: "FAQ" as any, slug } });
        if (exists) continue;

        await prisma.asset.create({
          data: {
            customerId: customer.id,
            type: "FAQ" as any,
            status: "PUBLISHED" as any,
            title: q,
            slug,
            meta: { source: "crawl_seed", url: fp.url, kind: "faq_item" } as any,
            versions: { create: { version: 1, content: `# ${q}\n\n${a}\n` } },
          },
        });
        faqItemsCreated += 1;
      }
    }
  }

  // Products: create real products from Product schema where possible.
  const productPages = pages.filter((p) => looksLikeProduct(p.url));
  for (const p of productPages.slice(0, Math.max(productLimit * 3, productLimit))) {
    const pathname = new URL(p.url).pathname;
    const handle = slugify(pathname.split("/").filter(Boolean).pop() || "");
    if (!handle) continue;

    const exists = await prisma.product.findFirst({ where: { customerId: customer.id, handle } });
    if (exists) continue;

    const nodes = extractJsonLd(p.html);
    const products = findSchema(nodes, ["Product"]);
    const picked = products[0] as any;

    const title = String(picked?.name || p.title || handle.replace(/-/g, " ")).trim();
    const brand = String(picked?.brand?.name || picked?.brand || "").trim();
    const imagesRaw = picked?.image;
    const images = Array.isArray(imagesRaw) ? imagesRaw : imagesRaw ? [imagesRaw] : [];

    // Offers can be object or array; normalize and parse price.
    const offersRaw = picked?.offers;
    const offers = Array.isArray(offersRaw) ? offersRaw : offersRaw ? [offersRaw] : [];
    const priceStr = String(offers[0]?.price ?? "").trim();
    const currency = String(offers[0]?.priceCurrency || "").trim() || undefined;
    const priceNum = Number(priceStr);
    const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : undefined;

    const desc = String(picked?.description || "").trim();
    const fallbackDesc = (p.text || "").slice(0, 900).trim();
    const descriptionHtml = `<p>${(desc || fallbackDesc || "").replace(/\s+/g, " ")}</p>`;

    await prisma.product.create({
      data: {
        customerId: customer.id,
        handle,
        title,
        vendor: brand || undefined,
        tags: "crawl",
        priceMin: priceCents,
        priceMax: priceCents,
        currency: currency || undefined,
        images: images.length ? images : undefined,
        descriptionHtml,
        specs: { sourceUrl: p.url, schema: picked ? { "@type": picked?.["@type"], sku: picked?.sku } : undefined } as any,
      },
    });
    productCreated += 1;
    if (productCreated >= productLimit) break;
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "ORCHESTRATOR",
    summary: "Seeded demo content from latest crawl pages",
    input: { domain, crawlRunId: crawlRun.id, limit },
    output: { blogCreated, faqItemsCreated, productCreated },
  });

  console.log("✅ seeded from crawl", { domain, crawlRunId: crawlRun.id, blogCreated, faqItemsCreated, productCreated });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

