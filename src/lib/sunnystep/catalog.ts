import path from "path";
import fs from "fs/promises";
import type { SunnyStepBlogPost, SunnyStepFaqDoc, SunnyStepProduct, SunnyStepRawBlogMeta, SunnyStepRawProduct } from "./types";

function toSlug(input: string): string {
  const decoded = decodeURIComponent(input)
    .replaceAll("’", "'")
    .replaceAll("–", "-")
    .replaceAll("—", "-");

  return decoded
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function idFromParts(...parts: string[]): string {
  return parts
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9|_-]+/g, "")
    .slice(0, 180);
}

function productSlugFromUrl(url: string): string {
  const u = new URL(url);
  const seg = u.pathname.split("/").filter(Boolean).pop() || "";
  return toSlug(seg);
}

function blogSlugFromUrl(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("communitystory");
  const seg = idx >= 0 ? parts.slice(idx + 1).join("/") : parts.at(-1) || "";
  return toSlug(seg || "communitystory");
}

const DEMO_ROOT = process.cwd();

async function readJsonFile<T>(absPath: string): Promise<T> {
  const raw = await fs.readFile(absPath, "utf8");
  return JSON.parse(raw) as T;
}

export async function getSunnyStepProducts(): Promise<SunnyStepProduct[]> {
  const abs = path.join(DEMO_ROOT, "demo_sunnystep", "products.json");
  const raw = await readJsonFile<SunnyStepRawProduct[]>(abs);

  const base: SunnyStepProduct[] = raw.map((p) => {
    const slug = productSlugFromUrl(p.url);
    const price = Number(p.price);
    return {
      id: idFromParts("product", slug, p.sku),
      slug,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      price: Number.isFinite(price) ? price : 0,
      priceCurrency: p.priceCurrency || "SGD",
      description:
        p.description ||
        "Designed for long days on your feet: structured support, plush comfort, and clean styling that goes anywhere.",
      images: (p.images || []).map((img) => img.replace(/^\/+/, "")),
      sourceUrl: p.url,
    };
  });

  // The seed dataset currently has 15 items; for demo we extend to 20 using safe variants (same imagery).
  // We clearly label them as "Limited Colorway" variants.
  if (base.length >= 20) return base.slice(0, 20);

  const variantsNeeded = 20 - base.length;
  const colorways = ["Midnight", "Pearl", "Sand", "Forest", "Rose", "Slate", "Cocoa"];

  const variants: SunnyStepProduct[] = [];
  for (let i = 0; i < variantsNeeded; i++) {
    const src = base[i % base.length];
    const color = colorways[i % colorways.length];
    const slug = `${src.slug}-${toSlug(color)}`;
    variants.push({
      ...src,
      id: idFromParts("product-variant", slug, src.sku, String(i)),
      slug,
      name: `${src.name} — Limited Colorway: ${color}`,
      sku: `${src.sku}-${String(i + 1).padStart(2, "0")}`,
      price: Math.max(95, src.price + (i % 2 === 0 ? 10 : -5)),
      isVariant: true,
      variantOf: src.slug,
      sourceUrl: src.sourceUrl,
    });
  }

  return [...base, ...variants].slice(0, 20);
}

export async function getSunnyStepProductBySlug(slug: string): Promise<SunnyStepProduct | null> {
  const all = await getSunnyStepProducts();
  return all.find((p) => p.slug === slug) || null;
}

export async function getSunnyStepBlogPosts(): Promise<SunnyStepBlogPost[]> {
  const abs = path.join(DEMO_ROOT, "demo_sunnystep", "blogs.json");
  const raw = await readJsonFile<SunnyStepRawBlogMeta[]>(abs);

  const posts = raw
    .map((b) => {
      const slug = blogSlugFromUrl(b.url);
      return {
        id: idFromParts("blog", slug),
        slug,
        headline: b.headline,
        description: b.description,
        datePublished: b.datePublished,
        image: (b.image || "").replace(/^\/+/, ""),
        sourceUrl: b.url,
      } satisfies SunnyStepBlogPost;
    })
    // Skip the "Sunnystep Blog" index page; keep only actual posts with a slug segment.
    .filter((p) => p.slug !== "communitystory" && p.headline.toLowerCase() !== "sunnystep blog");

  return posts;
}

export async function getSunnyStepBlogPostBySlug(slug: string): Promise<SunnyStepBlogPost | null> {
  const all = await getSunnyStepBlogPosts();
  return all.find((p) => p.slug === slug) || null;
}

export async function getSunnyStepFaq(): Promise<SunnyStepFaqDoc> {
  const abs = path.join(DEMO_ROOT, "demo_sunnystep", "faqs.json");
  return readJsonFile<SunnyStepFaqDoc>(abs);
}

