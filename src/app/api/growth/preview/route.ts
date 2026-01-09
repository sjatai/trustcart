import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const domain = body?.domain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
  const ruleSetId: string = body?.ruleSetId;
  if (!ruleSetId) return Response.json({ ok: false, error: "missing_ruleSetId" }, { status: 400 });

  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

  const ruleSet = await prisma.ruleSet.findUnique({ where: { id: ruleSetId } });
  if (!ruleSet) return Response.json({ ok: false, error: "ruleset_not_found" }, { status: 404 });

  // Deterministic demo segmentation. In production this would query Birdeye + CRM.
  const baseSize = ruleSet.name.toLowerCase().includes("referral") ? 42 : 120;
  const suppressed = ruleSet.name.toLowerCase().includes("review request") ? 18 : 6;
  const reasons = ruleSet.name.toLowerCase().includes("review request")
    ? { negative_sentiment: 9, open_case: 9 }
    : { trust_below_threshold: 4, opted_out: 2 };

  const snap = await prisma.segmentSnapshot.create({
    data: {
      customerId: customer.id,
      ruleSetId: ruleSet.id,
      size: baseSize,
      suppressed,
      reasons: reasons as any,
    },
  });

  await prisma.activityEvent.create({
    data: {
      customerId: customer.id,
      kind: "segment_snapshot_created",
      summary: `Segment preview created for rule: ${ruleSet.name} (size ${baseSize}, suppressed ${suppressed}).`,
      payload: { ruleSetId: ruleSet.id, segmentSnapshotId: snap.id, reasons },
    },
  });

  return Response.json({ ok: true, ruleSet: { id: ruleSet.id, name: ruleSet.name }, snapshot: snap });
}


