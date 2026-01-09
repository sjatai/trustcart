import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const primaryDomain = "reliablenissan.com";
  const domain = process.env.NEXT_PUBLIC_DEMO_DOMAIN || primaryDomain;

  // Ensure the demo customer exists (Phase 1 requirement).
  const customer = await prisma.customer.upsert({
    where: { domain: primaryDomain },
    update: { name: "Reliable Nissan" },
    create: {
      name: "Reliable Nissan",
      domain: primaryDomain,
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

  // Backward-compat: if NEXT_PUBLIC_DEMO_DOMAIN differs, ensure a customer exists for that domain too.
  if (domain !== primaryDomain) {
    await prisma.customer.upsert({
      where: { domain },
      update: { name: "Demo Customer" },
      create: { name: "Demo Customer", domain },
    });
  }

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

  // Baseline trust snapshots (System trust + Consumer trust)
  const existingTrust = await prisma.trustScoreSnapshot.findFirst({ where: { customerId: customer.id } });
  if (!existingTrust) {
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
  }

  const existingConsumer = await prisma.consumerTrustSnapshot.findFirst({ where: { customerId: customer.id } });
  if (!existingConsumer) {
    await prisma.consumerTrustSnapshot.create({
      data: {
        customerId: customer.id,
        total: 70,
        clarity: 72,
        proof: 66,
        freshness: 70,
        consistency: 68,
        sentimentLift: 70,
      },
    });
  }

  const existingVisibility = await prisma.visibilityScoreSnapshot.findFirst({ where: { customerId: customer.id } });
  if (!existingVisibility) {
    await prisma.visibilityScoreSnapshot.create({
      data: {
        customerId: customer.id,
        total: 83,
        coverage: 100,
        specificity: 95,
        proof: 66,
        freshness: 72,
        aiReadiness: 76,
      },
    });
  }

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
      where: { customerId_email: { customerId: customer.id, email: ec.email } },
      update: { firstName: ec.firstName, lastName: ec.lastName, attributes: ec.attributes },
      create: { customerId: customer.id, email: ec.email, firstName: ec.firstName, lastName: ec.lastName, attributes: ec.attributes },
    });
  }

  // Seed canonical Receipt ledger (enterprise audit trail) — deterministic chain
  const receiptCount = await prisma.receipt.count({ where: { customerId: customer.id } });
  if (receiptCount < 10) {
    await prisma.receipt.createMany({
      data: [
        {
          customerId: customer.id,
          kind: "READ" as any,
          actor: "CRAWLER" as any,
          summary: "Crawler read seed pages for reliablenissan.com",
          input: { domain: customer.domain, maxPages: 8 } as any,
          output: { pages: 8, failures: 0 } as any,
        },
        {
          customerId: customer.id,
          kind: "READ" as any,
          actor: "INTENT_ENGINE" as any,
          summary: "Intent engine loaded top questions and current gaps",
          input: { domain: customer.domain, topN: 20 } as any,
          output: { questionsLoaded: 20 } as any,
        },
        {
          customerId: customer.id,
          kind: "DECIDE" as any,
          actor: "TRUST_ENGINE" as any,
          summary: "Trust engine computed system trust gate",
          input: { signals: "seeded" } as any,
          output: { zone: "READY", total: 72 } as any,
        },
        {
          customerId: customer.id,
          kind: "DECIDE" as any,
          actor: "TRUST_ENGINE" as any,
          summary: "Consumer trust baseline computed",
          input: { signals: "seeded" } as any,
          output: { total: 70, clarity: 72, proof: 66 } as any,
        },
        {
          customerId: customer.id,
          kind: "PUBLISH" as any,
          actor: "CONTENT_ENGINE" as any,
          summary: "Content engine published verified answers (demo)",
          input: { assetTypes: ["FAQ", "BLOG"], count: 2 } as any,
          output: { published: true, count: 2 } as any,
        },
        {
          customerId: customer.id,
          kind: "DECIDE" as any,
          actor: "RULE_ENGINE" as any,
          summary: "Rule engine evaluated segment for referral advocates",
          input: { ruleset: "Referral advocates" } as any,
          output: { size: 42, suppressed: 6 } as any,
        },
        {
          customerId: customer.id,
          kind: "SUPPRESS" as any,
          actor: "RULE_ENGINE" as any,
          summary: "Suppression applied (opt-outs + trust threshold)",
          input: { reasons: ["opted_out", "trust_below_threshold"] } as any,
          output: { suppressed: 6 } as any,
        },
        {
          customerId: customer.id,
          kind: "EXECUTE" as any,
          actor: "DELIVERY" as any,
          summary: "Delivery executed DRY_RUN campaign (no sends)",
          input: { channel: "email", mode: "dry_run" } as any,
          output: { status: "DRY_RUN", recipients: 5 } as any,
        },
        {
          customerId: customer.id,
          kind: "READ" as any,
          actor: "ORCHESTRATOR" as any,
          summary: "Orchestrator assembled run context (demo)",
          input: { command: "onboard", domain: customer.domain } as any,
          output: { steps: ["Analyzer", "Knowledge", "Trust", "Reporter"] } as any,
        },
        {
          customerId: customer.id,
          kind: "DECIDE" as any,
          actor: "ORCHESTRATOR" as any,
          summary: "Orchestrator selected next best action",
          input: { lastCommand: "onboard" } as any,
          output: { suggested: "Generate intent graph for Reliable Nissan (top 20)" } as any,
        },
      ],
    });
  }

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
