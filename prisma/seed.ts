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
