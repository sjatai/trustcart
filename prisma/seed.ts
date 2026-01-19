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
  // Controlled multi-domain demo (DB-driven, domain-safe)
  const nissanDomain = "reliablenissan.com";
  const sunnyDomain = "sunnystep.com";

  const nissanCustomer = await prisma.customer.upsert({
    where: { domain: nissanDomain },
    update: { name: "Reliable Nissan" },
    create: { name: "Reliable Nissan", domain: nissanDomain },
  });

  const sunnyCustomer = await prisma.customer.upsert({
    where: { domain: sunnyDomain },
    update: { name: "SunnyStep" },
    create: { name: "SunnyStep", domain: sunnyDomain },
  });

  // Seed EndCustomers (growth targeting)
  const endCustomers: Array<{ email: string; firstName: string; lastName: string; attributes: any }> = [];
  for (let i = 0; i < 10; i++) {
    endCustomers.push({
      email: `demo.advocate+${i + 1}@example.com`,
      firstName: "Alex",
      lastName: `Advocate${i + 1}`,
      attributes: {
        rating: 5,
        sentiment: "positive",
        referralSent: i % 4 === 0,
        lastSeenAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      },
    });
  }
  for (let i = 0; i < 6; i++) {
    endCustomers.push({
      email: `demo.neutral+${i + 1}@example.com`,
      firstName: "Sam",
      lastName: `Neutral${i + 1}`,
      attributes: {
        rating: 3,
        sentiment: "neutral",
        referralSent: false,
        lastSeenAt: new Date(Date.now() - (i + 10) * 86_400_000).toISOString(),
      },
    });
  }
  for (let i = 0; i < 4; i++) {
    endCustomers.push({
      email: `demo.risk+${i + 1}@example.com`,
      firstName: "Riley",
      lastName: `Risk${i + 1}`,
      attributes: {
        rating: 1,
        sentiment: "negative",
        referralSent: false,
        lastSeenAt: new Date(Date.now() - (i + 16) * 86_400_000).toISOString(),
      },
    });
  }

  for (const ec of endCustomers) {
    await prisma.endCustomer.upsert({
      where: { customerId_email: { customerId: nissanCustomer.id, email: ec.email } },
      update: { firstName: ec.firstName, lastName: ec.lastName, attributes: ec.attributes },
      create: { customerId: nissanCustomer.id, email: ec.email, firstName: ec.firstName, lastName: ec.lastName, attributes: ec.attributes },
    });
  }

  console.log("Seeded customers:", nissanCustomer.domain, sunnyCustomer.domain);

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
