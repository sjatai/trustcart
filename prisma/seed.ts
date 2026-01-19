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

async function upsertClaimWithEvidence(args: {
  customerId: string;
  key: string;
  value: string;
  url: string;
  snippet: string;
  confidence?: number;
}) {
  const confidence = args.confidence ?? 95;
  const existing = await prisma.claim.findFirst({ where: { customerId: args.customerId, key: args.key } });
  const claim = existing
    ? await prisma.claim.update({
        where: { id: existing.id },
        data: { value: args.value, confidence, freshnessAt: new Date() },
      })
    : await prisma.claim.create({
        data: {
          customerId: args.customerId,
          key: args.key,
          value: args.value,
          confidence,
          freshnessAt: new Date(),
        },
      });

  // Always append evidence so we can show freshness/grounding.
  await prisma.evidence.create({
    data: { claimId: claim.id, url: args.url, snippet: args.snippet },
  });

  return claim;
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

  // Ensure the curated "exercise/comfort science" demo post is present and shows first with a nice hero image.
  // This is intentionally deterministic and safe to run repeatedly (it updates or creates a single post).
  try {
    const curatedTitle = "Comfort science for walking + running: reduce fatigue, recover better";
    const curatedSlug = "comfort-science-walking-running";
    const curatedHero = "/images/blogs/woman_doing_run_walk_method.avif";
    const curatedExcerpt = "A practical guide to reducing fatigue and recovering better—using comfort science principles for walking and running.";
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
      where: { customerId: sunnyCustomer.id, type: "BLOG" as any, title: { equals: curatedTitle, mode: "insensitive" } as any },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!existing) {
      await prisma.asset.create({
        data: {
          customerId: sunnyCustomer.id,
          type: "BLOG" as any,
          status: "PUBLISHED" as any,
          title: curatedTitle,
          slug: curatedSlug,
          meta: {
            excerpt: curatedExcerpt,
            imageUrl: curatedHero,
            seed: "demo_curated/comfort_science",
          } as any,
          versions: { create: [{ version: 1, content: curatedMd }] },
        } as any,
      });
      console.log("Seeded curated blog:", curatedSlug);
    } else {
      // Keep it on top by updating updatedAt (via any update) and only add a new version if content changed.
      const latestContent = String(existing.versions?.[0]?.content || "");
      const needsNewVersion = latestContent.trim() !== curatedMd.trim();
      const latestVersion = existing.versions?.[0]?.version || 1;

      await prisma.asset.update({
        where: { id: existing.id },
        data: {
          status: "PUBLISHED" as any,
          slug: existing.slug || curatedSlug,
          meta: {
            ...(typeof existing.meta === "object" && existing.meta ? (existing.meta as any) : {}),
            excerpt: curatedExcerpt,
            imageUrl: curatedHero,
            seed: "demo_curated/comfort_science",
          } as any,
          versions: needsNewVersion ? { create: [{ version: latestVersion + 1, content: curatedMd }] } : undefined,
        } as any,
      });
    }
  } catch (e) {
    console.warn("Skipped curated blog seed:", e);
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

    // Seed a minimal set of VERIFIED claims needed to prefill two demo FAQ drafts.
    // This keeps the demo deterministic even without OPENAI_API_KEY.
    const faqSeedFile = path.join(process.cwd(), "data", "sunnystep_seed.json");
    const rawFaqSeed = fs.readFileSync(faqSeedFile, "utf8");
    const faqSeed = JSON.parse(rawFaqSeed) as {
      faqs?: Array<{ question?: string; answer?: string; sourceUrl?: string }>;
    };
    const faqItems = Array.isArray(faqSeed?.faqs) ? faqSeed.faqs : [];
    const findFaq = (q: string) => faqItems.find((x) => String(x.question || "").trim().toLowerCase() === q.toLowerCase()) || null;
    const qStores = findFaq("Does Sunnystep have physical stores?");
    const qSize = findFaq("How do I choose the right size?");

    if (qStores?.answer) {
      await upsertClaimWithEvidence({
        customerId: sunnyCustomer.id,
        key: "store.sg.locations",
        value: String(qStores.answer).trim(),
        url: String(qStores.sourceUrl || "https://www.sunnystep.com/pages/frequently-asked-questions"),
        snippet: String(qStores.answer).trim().slice(0, 260),
      });
      // If the FAQ doesn't include hours explicitly, keep a conservative claim aligned with the site.
      await upsertClaimWithEvidence({
        customerId: sunnyCustomer.id,
        key: "store.sg.hours",
        value: "Store opening hours vary by location. Check the store locator for the latest hours for each store.",
        url: "https://www.sunnystep.com/pages/store-locations",
        snippet: "Store hours vary by location; check the store locator for the latest opening hours.",
      });
    }

    if (qSize?.answer) {
      await upsertClaimWithEvidence({
        customerId: sunnyCustomer.id,
        key: "product.fit.true_to_size",
        value: String(qSize.answer).trim(),
        url: String(qSize.sourceUrl || "https://www.sunnystep.com/pages/frequently-asked-questions"),
        snippet: String(qSize.answer).trim().slice(0, 260),
      });
      await upsertClaimWithEvidence({
        customerId: sunnyCustomer.id,
        key: "size.guide.conversion",
        value: "Use the size guide on the site for fit notes and size conversion guidance (US/EU/UK) where provided.",
        url: "https://www.sunnystep.com/pages/frequently-asked-questions",
        snippet: "Use the size guide on-site for fit notes and any available size conversion guidance.",
      });
    }
  } catch (e) {
    console.warn("Skipped FAQ seed (missing/invalid file):", e);
  }

  // Seed demand signals (Questions) for SunnyStep so the Inspect rail has a rich default set.
  // This is intentionally deterministic for demos (Vercel runs `prisma db seed` in build).
  const curatedQuestions: Array<{ taxonomy: string; impactScore: number; text: string }> = [
    // A) Near me / Location intent (10) — AVAILABILITY
    { taxonomy: "AVAILABILITY", impactScore: 95, text: "Where can I buy comfortable sneakers near Orchard Road?" },
    { taxonomy: "AVAILABILITY", impactScore: 94, text: "Best shoe store near Marina Bay Sands (MBS) for walking shoes?" },
    { taxonomy: "AVAILABILITY", impactScore: 93, text: "Any shoe stores open late near Somerset MRT?" },
    { taxonomy: "AVAILABILITY", impactScore: 92, text: "Where can I try shoes in-store near ION Orchard?" },
    { taxonomy: "AVAILABILITY", impactScore: 91, text: "Shoe store near City Hall MRT with wide sizes?" },
    { taxonomy: "AVAILABILITY", impactScore: 90, text: "Where can I find stylish sneakers near Bugis?" },
    { taxonomy: "AVAILABILITY", impactScore: 89, text: "Best place to buy shoes near Raffles Place for office wear?" },
    { taxonomy: "AVAILABILITY", impactScore: 88, text: "Shoe store near Dhoby Ghaut with good return policy?" },
    { taxonomy: "AVAILABILITY", impactScore: 87, text: "Where can I get shoes delivered fast in Singapore CBD?" },
    { taxonomy: "AVAILABILITY", impactScore: 86, text: "Is there a store where I can try and buy shoes same day in Singapore?" },

    // B) Comfort / walking / pain relief (10) — SUITABILITY
    { taxonomy: "SUITABILITY", impactScore: 85, text: "Best sneakers for walking all day in Singapore?" },
    { taxonomy: "SUITABILITY", impactScore: 84, text: "Shoes for plantar fasciitis available in Singapore?" },
    { taxonomy: "SUITABILITY", impactScore: 83, text: "Best shoes for wide feet that don’t hurt?" },
    { taxonomy: "SUITABILITY", impactScore: 82, text: "Comfortable shoes for standing long hours (retail / F&B)?" },
    { taxonomy: "SUITABILITY", impactScore: 81, text: "Sneakers that are breathable for humid weather?" },
    { taxonomy: "SUITABILITY", impactScore: 80, text: "Best shoes for travel and long walking days?" },
    { taxonomy: "SUITABILITY", impactScore: 79, text: "Shoes that don’t cause heel pain?" },
    { taxonomy: "SUITABILITY", impactScore: 78, text: "Comfortable shoes for flat feet?" },
    { taxonomy: "SUITABILITY", impactScore: 77, text: "Best shoes for everyday commuting in Singapore?" },
    { taxonomy: "SUITABILITY", impactScore: 76, text: "Sneakers that feel soft but still supportive?" },

    // C) Occasion intent (10) — SUITABILITY
    { taxonomy: "SUITABILITY", impactScore: 75, text: "Best shoes for office work (smart casual) in Singapore?" },
    { taxonomy: "SUITABILITY", impactScore: 74, text: "Shoes for a wedding that are comfortable?" },
    { taxonomy: "SUITABILITY", impactScore: 73, text: "Comfortable shoes for party/night out?" },
    { taxonomy: "SUITABILITY", impactScore: 72, text: "Shoes that match dress + comfort?" },
    { taxonomy: "SUITABILITY", impactScore: 71, text: "Sneakers that look premium for business meetings?" },
    { taxonomy: "SUITABILITY", impactScore: 70, text: "Best shoes for travel + airport + city walking?" },
    { taxonomy: "SUITABILITY", impactScore: 69, text: "Shoes for date night but still comfy?" },
    { taxonomy: "SUITABILITY", impactScore: 68, text: "Shoes for rainy days in Singapore?" },
    { taxonomy: "SUITABILITY", impactScore: 67, text: "Shoes for school/college daily wear?" },
    { taxonomy: "SUITABILITY", impactScore: 66, text: "Shoes for gym + casual (hybrid use)?" },

    // D) Fit / size / comparison intent (8) — NEXT_STEP
    { taxonomy: "NEXT_STEP", impactScore: 65, text: "How do I choose the right shoe size online in Singapore?" },
    { taxonomy: "NEXT_STEP", impactScore: 64, text: "Do these sneakers run true to size?" },
    { taxonomy: "NEXT_STEP", impactScore: 63, text: "Are they good for wide feet?" },
    { taxonomy: "NEXT_STEP", impactScore: 62, text: "How do I measure my feet at home?" },
    { taxonomy: "NEXT_STEP", impactScore: 61, text: "What if my size is between two sizes?" },
    { taxonomy: "NEXT_STEP", impactScore: 60, text: "Do you have half sizes?" },
    { taxonomy: "NEXT_STEP", impactScore: 59, text: "Are returns free if size doesn’t fit?" },
    { taxonomy: "NEXT_STEP", impactScore: 58, text: "Can I exchange size in-store after ordering online?" },

    // E) Shipping / delivery / returns intent (7) — NEXT_STEP
    { taxonomy: "NEXT_STEP", impactScore: 57, text: "How fast is delivery within Singapore?" },
    { taxonomy: "NEXT_STEP", impactScore: 56, text: "Do you offer same-day delivery?" },
    { taxonomy: "NEXT_STEP", impactScore: 55, text: "Do you ship to Sentosa / Jurong / Tampines?" },
    { taxonomy: "NEXT_STEP", impactScore: 54, text: "What’s the return policy for shoes (worn vs unworn)?" },
    { taxonomy: "NEXT_STEP", impactScore: 53, text: "Can I return shoes bought online in-store?" },
    { taxonomy: "NEXT_STEP", impactScore: 52, text: "How long does refund take in Singapore?" },
    { taxonomy: "NEXT_STEP", impactScore: 51, text: "Is shipping free above a minimum order?" },

    // F) Trust / authenticity / reviews intent (5) — RISK
    { taxonomy: "RISK", impactScore: 50, text: "Are these shoes authentic and verified?" },
    { taxonomy: "RISK", impactScore: 49, text: "How do I know if this shoe is good quality?" },
    { taxonomy: "RISK", impactScore: 48, text: "What do customers say about comfort after long wear?" },
    { taxonomy: "RISK", impactScore: 47, text: "Are there reviews for this specific shoe model?" },
    { taxonomy: "RISK", impactScore: 46, text: "Is this brand good compared to other comfort sneaker brands?" },
  ];

  const normalizedQuestions = curatedQuestions
    .map((q) => ({
      taxonomy: String(q.taxonomy || "SUITABILITY").toUpperCase(),
      impactScore: Math.max(1, Math.min(100, Number(q.impactScore ?? 60))),
      text: String(q.text || "").trim(),
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

  // Prefill two demo FAQ drafts (DRAFTED) so the "Open recommended content → Publish" demo is immediate.
  // Does not require OPENAI_API_KEY: drafts are grounded using seeded claims/evidence above.
  try {
    const mkFaqDraft = (args: { title: string; stableSlug: string; shortAnswer: string; bodyMd: string }) => ({
      type: "FAQ",
      title: args.title,
      slug: args.stableSlug,
      targetUrl: "/faq",
      content: {
        shortAnswer: args.shortAnswer,
        bodyMarkdown: args.bodyMd.trim() + "\n",
        factsUsed: [],
        needsVerification: [],
        llmEvidence: [{ provider: "SIMULATED", quote: "Prefilled from seeded site facts (no OpenAI required)." }],
      },
    });

    const storesDraftBody = [
      `# FAQ: Where are your stores in Singapore, and what are the opening hours?`,
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
      `# FAQ: How do I choose my size? (fit + size conversion)`,
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

    const demoFaqRecs = [
      {
        title: "FAQ: Where are your stores in Singapore, and what are the opening hours?",
        stableSlug: "faq-stores-singapore-hours",
        targetUrl: "/faq",
        why: "We found the underlying facts in discovery, but shoppers need a single clear FAQ answer.",
        suggested: storesDraftBody,
      },
      {
        title: "FAQ: How do I choose my size? (fit + size conversion)",
        stableSlug: "faq-size-guide-conversion",
        targetUrl: "/faq",
        why: "We found the underlying facts in discovery, but shoppers need a single clear FAQ answer.",
        suggested: sizeDraftBody,
      },
    ];

    for (const r of demoFaqRecs) {
      const existing = await prisma.contentRecommendation.findFirst({
        where: { customerId: sunnyCustomer.id, title: r.title, publishTarget: "FAQ" as any },
        select: { id: true },
      });

      const draft =
        r.title.indexOf("stores") >= 0
          ? mkFaqDraft({
              title: r.title,
              stableSlug: r.stableSlug,
              shortAnswer: "Find SunnyStep stores in Singapore and check store-specific opening hours via the store locator.",
              bodyMd: storesDraftBody,
            })
          : mkFaqDraft({
              title: r.title,
              stableSlug: r.stableSlug,
              shortAnswer: "Use the size guide; fit may vary by style. Follow the brand’s fit notes and size conversion guidance where provided.",
              bodyMd: sizeDraftBody,
            });

      if (existing) {
        await prisma.contentRecommendation.update({
          where: { id: existing.id },
          data: {
            status: "DRAFTED" as any,
            kind: "CREATE" as any,
            title: r.title,
            why: r.why,
            targetUrl: r.targetUrl,
            suggestedContent: r.suggested,
            recommendedAssetType: "FAQ" as any,
            publishTarget: "FAQ" as any,
            llmEvidence: { stableSlug: r.stableSlug, draft } as any,
          } as any,
        });
      } else {
        await prisma.contentRecommendation.create({
          data: {
            customerId: sunnyCustomer.id,
            kind: "CREATE" as any,
            status: "DRAFTED" as any,
            title: r.title,
            why: r.why,
            targetUrl: r.targetUrl,
            suggestedContent: r.suggested,
            recommendedAssetType: "FAQ" as any,
            publishTarget: "FAQ" as any,
            llmEvidence: { stableSlug: r.stableSlug, draft } as any,
          } as any,
        });
      }

      // Ensure there is a draft Asset row so versioning is clean even before first edit.
      const existingAsset = await prisma.asset.findFirst({
        where: { customerId: sunnyCustomer.id, type: "FAQ" as any, slug: r.stableSlug },
        select: { id: true },
      });
      if (!existingAsset) {
        await prisma.asset.create({
          data: {
            customerId: sunnyCustomer.id,
            type: "FAQ" as any,
            status: "DRAFT" as any,
            title: r.title,
            slug: r.stableSlug,
            meta: { source: "seed_prefill", placement: "/faq" } as any,
            versions: { create: { version: 1, content: r.suggested } },
          } as any,
        });
      }
    }
  } catch (e) {
    console.warn("Skipped prefilled demo FAQ drafts:", e);
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
