import { prisma } from "@/lib/db";

const QUESTION_BANK: Array<{
  taxonomy: "AVAILABILITY" | "SUITABILITY" | "RISK" | "COST_VALUE" | "NEXT_STEP";
  text: string;
  impactScore: number;
  recommendedAssetType: "FAQ" | "BLOG" | "TRUTH_BLOCK";
  needs: string[];
}> = [
  // COST_VALUE
  { taxonomy: "COST_VALUE", text: "Do you offer bad credit financing?", impactScore: 92, recommendedAssetType: "FAQ", needs: ["financing.bad_credit"] },
  { taxonomy: "COST_VALUE", text: "What is my trade-in worth and how does it work?", impactScore: 88, recommendedAssetType: "FAQ", needs: ["trade_in.process"] },
  { taxonomy: "COST_VALUE", text: "What fees should I expect when buying a vehicle?", impactScore: 72, recommendedAssetType: "FAQ", needs: ["pricing.fees"] },
  { taxonomy: "COST_VALUE", text: "Do you have lease offers or low APR specials?", impactScore: 74, recommendedAssetType: "TRUTH_BLOCK", needs: ["financing.offers"] },

  // NEXT_STEP
  { taxonomy: "NEXT_STEP", text: "How do I book a test drive today?", impactScore: 90, recommendedAssetType: "TRUTH_BLOCK", needs: ["test_drive.booking"] },
  { taxonomy: "NEXT_STEP", text: "Can I schedule service online and how fast can I get in?", impactScore: 80, recommendedAssetType: "FAQ", needs: ["service.booking"] },
  { taxonomy: "NEXT_STEP", text: "What documents do I need to finance a car?", impactScore: 78, recommendedAssetType: "FAQ", needs: ["financing.docs"] },
  { taxonomy: "NEXT_STEP", text: "How do I contact a specialist right now?", impactScore: 70, recommendedAssetType: "TRUTH_BLOCK", needs: ["phone.primary", "hours.summary"] },

  // AVAILABILITY
  { taxonomy: "AVAILABILITY", text: "What are your service hours and can I walk in?", impactScore: 84, recommendedAssetType: "FAQ", needs: ["hours.summary"] },
  { taxonomy: "AVAILABILITY", text: "Do you have this model in stock today?", impactScore: 76, recommendedAssetType: "BLOG", needs: ["inventory.snapshot"] },
  { taxonomy: "AVAILABILITY", text: "Do you offer same-day appointments for service?", impactScore: 70, recommendedAssetType: "FAQ", needs: ["service.availability"] },
  { taxonomy: "AVAILABILITY", text: "What locations do you have and how do I get there?", impactScore: 68, recommendedAssetType: "FAQ", needs: ["locations.list"] },

  // RISK
  { taxonomy: "RISK", text: "Are your used cars inspected and certified?", impactScore: 82, recommendedAssetType: "BLOG", needs: ["used.inspection_process"] },
  { taxonomy: "RISK", text: "What warranty options do you provide?", impactScore: 74, recommendedAssetType: "FAQ", needs: ["warranty.options"] },
  { taxonomy: "RISK", text: "What’s your return or exchange policy?", impactScore: 66, recommendedAssetType: "FAQ", needs: ["policy.return"] },
  { taxonomy: "RISK", text: "How do you handle customer complaints?", impactScore: 64, recommendedAssetType: "BLOG", needs: ["policy.complaints"] },

  // SUITABILITY
  { taxonomy: "SUITABILITY", text: "Can you help me choose the right Nissan SUV for my family?", impactScore: 78, recommendedAssetType: "BLOG", needs: ["model.guidance"] },
  { taxonomy: "SUITABILITY", text: "Which models are best for fuel economy?", impactScore: 66, recommendedAssetType: "BLOG", needs: ["model.fuel_economy"] },
  { taxonomy: "SUITABILITY", text: "Do you have options for first-time buyers?", impactScore: 72, recommendedAssetType: "FAQ", needs: ["financing.first_time_buyers"] },
  { taxonomy: "SUITABILITY", text: "What’s the difference between new, used, and certified?", impactScore: 69, recommendedAssetType: "FAQ", needs: ["used.certified_definition"] },
];

export function colorForState(state: string) {
  // (moved to src/lib/intentColors.ts)
  return "#D0D5DD";
}

export async function ensureIntentQuestions(customerId: string) {
  const existing = await prisma.question.findMany({ where: { customerId } });
  const existingTexts = new Set(existing.map((q) => q.text));

  for (const q of QUESTION_BANK) {
    if (existingTexts.has(q.text)) continue;
    const created = await prisma.question.create({
      data: {
        customerId,
        taxonomy: q.taxonomy,
        text: q.text,
        impactScore: q.impactScore,
        recommendedAssetType: q.recommendedAssetType as any,
      },
    });

    for (const claimKey of q.needs) {
      await prisma.questionNeed.create({
        data: {
          questionId: created.id,
          claimKey,
          required: true,
        },
      });
    }
  }

  // Recompute gaps/state based on current claims.
  const claims = await prisma.claim.findMany({ where: { customerId } });
  const claimKeys = new Set(claims.map((c) => c.key));

  const questions = await prisma.question.findMany({
    where: { customerId },
    include: { needs: true, gaps: true },
    orderBy: { impactScore: "desc" },
    take: 25,
  });

  for (const q of questions) {
    // Clear prior gaps; rebuild lightweight.
    await prisma.questionGap.deleteMany({ where: { questionId: q.id } });

    const needs = q.needs || [];
    const missing = needs.filter((n) => n.required && !claimKeys.has(n.claimKey));
    for (const n of missing) {
      await prisma.questionGap.create({
        data: {
          questionId: q.id,
          gapType: "missing_proof",
          severity: Math.min(95, Math.max(40, q.impactScore)),
          description: `Missing proof for claim key: ${n.claimKey}`,
        },
      });
    }

    const newState =
      missing.length === 0 ? "ANSWERED" : missing.length <= 1 ? "WEAK" : "UNANSWERED";

    await prisma.question.update({ where: { id: q.id }, data: { state: newState as any } });
  }

  return prisma.question.findMany({
    where: { customerId },
    include: { needs: true, gaps: true },
    orderBy: { impactScore: "desc" },
    take: 20,
  });
}


