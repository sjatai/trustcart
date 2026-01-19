import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function shortHash(input: string): string {
  // Small deterministic hash for stable slugs (avoid extra deps in seed).
  const s = String(input || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  // Convert to unsigned + base36 for compactness.
  return (h >>> 0).toString(36).slice(0, 6);
}

function priceToCents(price: unknown): number | null {
  const priceNum = Number(String(price ?? "").trim());
  return Number.isFinite(priceNum) ? Math.round(priceNum * 100) : null;
}

async function main() {
  // SunnyStep-only demo seed (DB-driven)
  const sunnyDomain = "sunnystep.com";

  const sunnyCustomer = await prisma.customer.upsert({
    where: { domain: sunnyDomain },
    update: { name: "SunnyStep" },
    create: { name: "SunnyStep", domain: sunnyDomain },
  });

  console.log("Seeded customer:", sunnyCustomer.domain);

  // Seed products for SunnyStep from bundled demo snapshot (includes local image paths served via /api/assets).
  const productsFile = path.join(process.cwd(), "demo_sunnystep", "products.json");
  const rawProducts = fs.readFileSync(productsFile, "utf8");
  const sunnyProducts = (JSON.parse(rawProducts) as any[])
    .map((p) => {
      const url = String(p?.url || "").trim();
      const urlHandle = url ? url.split("/products/")[1]?.split(/[?#]/)[0] : "";
      const handle = slugify(urlHandle || p?.sku || p?.name || "");
      const title = String(p?.name || handle).trim();
      const vendor = String(p?.brand || "Sunnystep").trim() || "Sunnystep";
      const currency = String(p?.priceCurrency || "SGD").trim() || "SGD";
      const priceCents = priceToCents(p?.price);
      const images = Array.isArray(p?.images) ? (p.images as any[]).map((x) => String(x || "").trim()).filter(Boolean) : [];
      const description = String(p?.description || "").trim();

      return {
        handle,
        title,
        vendor,
        currency,
        priceMin: priceCents ?? undefined,
        priceMax: priceCents ?? undefined,
        images,
        descriptionHtml: description ? `<p>${description}</p>` : undefined,
        specs: { sourceUrl: url || null, seed: "demo_sunnystep/products.json" },
      };
    })
    .filter((p) => p.handle);

  const createdProducts = [];
  for (const product of sunnyProducts) {
    const result = await prisma.product.upsert({
      where: { customerId_handle: { customerId: sunnyCustomer.id, handle: product.handle } },
      update: {
        title: product.title,
        vendor: product.vendor,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        currency: product.currency,
        images: product.images as any,
        descriptionHtml: product.descriptionHtml,
        specs: product.specs,
      },
      create: {
        customerId: sunnyCustomer.id,
        handle: product.handle,
        title: product.title,
        vendor: product.vendor,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        currency: product.currency,
        images: product.images as any,
        descriptionHtml: product.descriptionHtml,
        specs: product.specs,
      },
    });
    createdProducts.push(result);
  }

  // Seed baseline blog posts for SunnyStep from bundled demo snapshot.
  // The storefront blog list only shows PUBLISHED posts; on fresh deploys we want a non-empty catalog.
  // To avoid overwriting real content, only seed when there are zero published blog assets.
  try {
    const publishedBlogCount = await prisma.asset.count({
      where: { customerId: sunnyCustomer.id, type: "BLOG" as any, status: "PUBLISHED" as any },
    });

    if (publishedBlogCount === 0) {
      const blogsIndexFile = path.join(process.cwd(), "demo_sunnystep", "blogs.json");
      const rawBlogs = fs.readFileSync(blogsIndexFile, "utf8");
      const blogIndex = JSON.parse(rawBlogs) as Array<{
        url?: string;
        headline?: string;
        description?: string;
        image?: string;
      }>;

      const mkSlug = (url: string, fallback: string) => {
        const u = String(url || "").trim();
        if (!u) return slugify(fallback);
        const cleaned = u.replace(/[?#].*$/, "").replace(/\/+$/, "");
        const parts = cleaned.split("/").filter(Boolean);
        const last = parts[parts.length - 1] || "";
        // "communitystory" is the blog root; use a friendlier slug in that case.
        if (last === "communitystory") return "sunnystep-blog";
        return slugify(last || fallback);
      };

      for (const entry of Array.isArray(blogIndex) ? blogIndex : []) {
        const title = String(entry?.headline || "").trim() || "Blog";
        const description = String(entry?.description || "").trim();
        const image = String(entry?.image || "").trim();
        const sourceUrl = String(entry?.url || "").trim();
        const slug = mkSlug(sourceUrl, title);

        const md = [
          `# ${title}`,
          "",
          description ? description : "A short demo blog post (seeded).",
          "",
          "## Why this matters",
          "- Helps shoppers decide faster with clear, grounded guidance.",
          "- Improves trust + AI readiness by answering common questions in one place.",
          "",
          sourceUrl ? `Source: ${sourceUrl}` : "",
          "",
        ]
          .filter((line) => line !== "")
          .join("\n");

        const asset = await prisma.asset.create({
          data: {
            customerId: sunnyCustomer.id,
            type: "BLOG" as any,
            status: "PUBLISHED" as any,
            title,
            slug,
            meta: {
              excerpt: description || null,
              imageUrl: image || null,
              sourceUrl: sourceUrl || null,
              seed: "demo_sunnystep/blogs.json",
            } as any,
            versions: {
              create: [{ version: 1, content: md }],
            },
          } as any,
        });

        // Keep a receipt trail via console for local runs; harmless on Vercel.
        console.log("Seeded blog:", asset.slug);
      }
    }
  } catch (e) {
    console.warn("Skipped blog seed (missing/invalid files):", e);
  }

  // Seed baseline FAQs for SunnyStep from the richer crawl export (data/sunnystep_seed.json).
  // IMPORTANT: do NOT seed the derived "What is this page about..." footer/policy pages as FAQs.
  // The storefront FAQ page pulls PUBLISHED FAQ assets; on fresh deploys we want a non-empty list.
  try {
    // Cleanup: remove previously-seeded derived/meta-only FAQ entries if they exist in the DB.
    // This is safe because it only targets the "What is this page about..." titles.
    await prisma.asset.deleteMany({
      where: {
        customerId: sunnyCustomer.id,
        type: "FAQ" as any,
        title: { startsWith: "What is this page about", mode: "insensitive" },
      } as any,
    });

    const publishedFaqCount = await prisma.asset.count({
      where: { customerId: sunnyCustomer.id, type: "FAQ" as any, status: "PUBLISHED" as any },
    });

    // Seed only when the catalog is empty/sparse (don't overwrite real published content).
    if (publishedFaqCount < 6) {
      const seedFile = path.join(process.cwd(), "data", "sunnystep_seed.json");
      const rawSeed = fs.readFileSync(seedFile, "utf8");
      const seed = JSON.parse(rawSeed) as {
        faqs?: Array<{ question?: string; answer?: string; sourceUrl?: string }>;
      };
      const items = Array.isArray(seed?.faqs) ? seed.faqs : [];

      for (let i = 0; i < items.length; i++) {
        const q = String(items[i]?.question || "").trim();
        const a = String(items[i]?.answer || "").trim();
        const url = String(items[i]?.sourceUrl || "").trim();
        if (!q || !a) continue;

        const slugBase = `faq-${slugify(q).slice(0, 48)}`;
        const slug = `${slugBase}-${shortHash(`${q}|${url}`)}`;

        const exists = await prisma.asset.findFirst({
          where: { customerId: sunnyCustomer.id, type: "FAQ" as any, slug },
          select: { id: true },
        });
        if (exists) continue;

        const md = [`# ${q}`, "", a, "", url ? `Source: ${url}` : ""].filter(Boolean).join("\n");
        const asset = await prisma.asset.create({
          data: {
            customerId: sunnyCustomer.id,
            type: "FAQ" as any,
            status: "PUBLISHED" as any,
            title: q,
            slug,
            meta: { source: "sunnystep_seed", url: url || null, seed: "data/sunnystep_seed.json" } as any,
            versions: { create: [{ version: 1, content: md }] },
          } as any,
        });

        console.log("Seeded FAQ:", asset.slug);
      }
    }
  } catch (e) {
    console.warn("Skipped FAQ seed (missing/invalid file):", e);
  }

  // Seed demand signals (Questions) for SunnyStep so the Inspect rail has a rich default set.
  // This makes the demo deterministic on fresh deploys (Vercel runs `prisma db seed` in build).
  const bankFile = path.join(process.cwd(), "data", "question_banks", "sunnystep_sg_v1.json");
  try {
    const rawBank = fs.readFileSync(bankFile, "utf8");
    const bank = JSON.parse(rawBank) as {
      questions?: Array<{ taxonomy?: string; weight?: number; text?: string }>;
    };
    const bankQuestions = Array.isArray(bank.questions) ? bank.questions : [];
    const normalizedQuestions = bankQuestions
      .map((q) => ({
        taxonomy: String(q?.taxonomy || "SUITABILITY").toUpperCase(),
        impactScore: Math.max(1, Math.min(100, Number(q?.weight ?? 60))),
        text: String(q?.text || "").trim(),
      }))
      .filter((q) => q.text.length > 0);

    // Keep the demo domain clean/deterministic: replace questions wholesale.
    await prisma.question.deleteMany({ where: { customerId: sunnyCustomer.id } });
    if (normalizedQuestions.length) {
      await prisma.question.createMany({
        data: normalizedQuestions.map((q) => ({
          customerId: sunnyCustomer.id,
          taxonomy: q.taxonomy as any,
          text: q.text,
          impactScore: q.impactScore,
          state: "UNANSWERED" as any,
          recommendedAssetType: "FAQ" as any,
        })),
      });
    }

    // Clear only PROPOSED recs so `/api/content-recommendations` will regenerate against the new bank.
    await prisma.contentRecommendation.deleteMany({
      where: { customerId: sunnyCustomer.id, status: "PROPOSED" as any },
    });

    console.log("Seeded demand questions:", normalizedQuestions.length);
  } catch (e) {
    console.warn("Skipped question bank seed (missing/invalid file):", bankFile);
  }

  // Receipt: seed baseline
  const alreadySeeded = await prisma.receipt.findFirst({
    where: { customerId: sunnyCustomer.id, summary: "Seeded demo customer baseline" },
    select: { id: true },
  });
  if (!alreadySeeded) {
    await prisma.receipt.create({
      data: {
        customerId: sunnyCustomer.id,
        kind: "EXECUTE" as any,
        actor: "CRAWLER" as any,
        summary: "Seeded demo customer baseline",
        input: { domain: sunnyDomain, products: sunnyProducts.length } as any,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
