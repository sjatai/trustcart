import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const domain = process.env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";

  const customer = await prisma.customer.upsert({
    where: { domain },
    update: { name: "Reliable Nissan" },
    create: {
      name: "Reliable Nissan",
      domain,
      locations: {
        create: [
          {
            name: "Reliable Nissan - Main",
            slug: "main",
            address: "Demo Address 1",
            city: "Albuquerque",
            region: "NM",
            country: "US",
            phone: "+1-505-000-0000",
          },
          {
            name: "Reliable Nissan - Service Center",
            slug: "service-center",
            address: "Demo Address 2",
            city: "Albuquerque",
            region: "NM",
            country: "US",
            phone: "+1-505-000-0001",
          },
        ],
      },
    },
    include: { locations: true },
  });

  const questions = [
    { taxonomy: "COST_VALUE", text: "Do you offer bad credit financing?", impactScore: 92, recommendedAssetType: "FAQ" },
    { taxonomy: "NEXT_STEP", text: "How do I book a test drive today?", impactScore: 90, recommendedAssetType: "TRUTH_BLOCK" },
    { taxonomy: "AVAILABILITY", text: "What are your service hours and can I walk in?", impactScore: 84, recommendedAssetType: "FAQ" },
    { taxonomy: "RISK", text: "Are your used cars inspected and certified?", impactScore: 82, recommendedAssetType: "BLOG" },
    { taxonomy: "SUITABILITY", text: "Can you help me choose the right Nissan SUV for my family?", impactScore: 78, recommendedAssetType: "BLOG" },
    { taxonomy: "COST_VALUE", text: "What is my trade-in worth and how does it work?", impactScore: 88, recommendedAssetType: "FAQ" },
    { taxonomy: "NEXT_STEP", text: "Do you have current service specials?", impactScore: 76, recommendedAssetType: "TRUTH_BLOCK" },
    { taxonomy: "RISK", text: "What warranty options do you provide?", impactScore: 74, recommendedAssetType: "FAQ" },
  ] as const;

  for (const q of questions) {
    await prisma.question.create({
      data: {
        customerId: customer.id,
        taxonomy: q.taxonomy as any,
        text: q.text,
        impactScore: q.impactScore,
        recommendedAssetType: q.recommendedAssetType as any,
      },
    });
  }

  await prisma.trustScoreSnapshot.create({
    data: {
      customerId: customer.id,
      total: 72,
      experience: 78,
      responsiveness: 70,
      stability: 68,
      recency: 72,
      risk: 60,
    },
  });

  // Default RuleSets (Block C1)
  await prisma.ruleSet.upsert({
    where: { customerId_name: { customerId: customer.id, name: "Referral advocates" } },
    update: {
      active: true,
      description: "rating>=4 & positive sentiment; trust>=81; dry-run",
      json: {
        kind: "referral_advocates",
        conditions: { ratingGte: 4, sentiment: "positive", trustGte: 81 },
        mode: "dry_run",
      },
    },
    create: {
      customerId: customer.id,
      name: "Referral advocates",
      active: true,
      description: "rating>=4 & positive sentiment; trust>=81; dry-run",
      json: {
        kind: "referral_advocates",
        conditions: { ratingGte: 4, sentiment: "positive", trustGte: 81 },
        mode: "dry_run",
      },
    },
  });

  await prisma.ruleSet.upsert({
    where: { customerId_name: { customerId: customer.id, name: "Review request new customers" } },
    update: {
      active: true,
      description: "last 14 days; no review; suppress negative/open; dry-run",
      json: {
        kind: "review_request_new_customers",
        windowDays: 14,
        suppress: ["negative", "open_case"],
        mode: "dry_run",
      },
    },
    create: {
      customerId: customer.id,
      name: "Review request new customers",
      active: true,
      description: "last 14 days; no review; suppress negative/open; dry-run",
      json: {
        kind: "review_request_new_customers",
        windowDays: 14,
        suppress: ["negative", "open_case"],
        mode: "dry_run",
      },
    },
  });

  console.log("Seeded customer:", customer.domain);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
