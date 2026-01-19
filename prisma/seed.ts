import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  // Seed products for SunnyStep (real DB rows; no UI mocks). Keep content minimal and non-assertive.
  const sunnyProducts = [
    {
      handle: "sunny-step-classic",
      title: "SunnyStep Classic",
      vendor: "SunnyStep",
      productType: "Footwear",
      tags: "footwear",
      priceMin: 9900,
      priceMax: 9900,
      currency: "USD",
      descriptionHtml: "<p>Baseline product seeded for demo. Replace with verified copy when available.</p>",
      specs: { note: "NEEDS_VERIFICATION" },
    },
    {
      handle: "sunny-step-runner",
      title: "SunnyStep Runner",
      vendor: "SunnyStep",
      productType: "Footwear",
      tags: "footwear",
      priceMin: 12900,
      priceMax: 12900,
      currency: "USD",
      descriptionHtml: "<p>Baseline product seeded for demo. Replace with verified copy when available.</p>",
      specs: { note: "NEEDS_VERIFICATION" },
    },
    {
      handle: "sunny-step-sandal",
      title: "SunnyStep Sandal",
      vendor: "SunnyStep",
      productType: "Footwear",
      tags: "footwear",
      priceMin: 7900,
      priceMax: 7900,
      currency: "USD",
      descriptionHtml: "<p>Baseline product seeded for demo. Replace with verified copy when available.</p>",
      specs: { note: "NEEDS_VERIFICATION" },
    },
    {
      handle: "sunny-step-boot",
      title: "SunnyStep Boot",
      vendor: "SunnyStep",
      productType: "Footwear",
      tags: "footwear",
      priceMin: 15900,
      priceMax: 15900,
      currency: "USD",
      descriptionHtml: "<p>Baseline product seeded for demo. Replace with verified copy when available.</p>",
      specs: { note: "NEEDS_VERIFICATION" },
    },
    {
      handle: "sunny-step-kids",
      title: "SunnyStep Kids",
      vendor: "SunnyStep",
      productType: "Footwear",
      tags: "footwear",
      priceMin: 6900,
      priceMax: 6900,
      currency: "USD",
      descriptionHtml: "<p>Baseline product seeded for demo. Replace with verified copy when available.</p>",
      specs: { note: "NEEDS_VERIFICATION" },
    },
  ];

  const createdProducts = [];
  for (const product of sunnyProducts) {
    const result = await prisma.product.upsert({
      where: { customerId_handle: { customerId: sunnyCustomer.id, handle: product.handle } },
      update: {
        title: product.title,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        descriptionHtml: product.descriptionHtml,
        specs: product.specs,
        currency: product.currency,
      },
      create: {
        customerId: sunnyCustomer.id,
        handle: product.handle,
        title: product.title,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        descriptionHtml: product.descriptionHtml,
        specs: product.specs,
        currency: product.currency,
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
