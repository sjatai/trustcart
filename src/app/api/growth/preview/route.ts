import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || body?.domain || getDomainFromRequest(req) || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnysteps.com";
  const ruleSetId: string = body?.ruleSetId;
  if (!ruleSetId) return Response.json({ ok: false, error: "missing_ruleSetId" }, { status: 400 });

  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

  const ruleSet = await prisma.ruleSet.findUnique({ where: { id: ruleSetId } });
  if (!ruleSet) return Response.json({ ok: false, error: "ruleset_not_found" }, { status: 404 });

  // Real segmentation using EndCustomer attributes.
  const cfg = (ruleSet.json || {}) as any;
  const conditions = cfg?.conditions || {};
  const ratingGte = Number(conditions?.ratingGte ?? 0);
  const sentimentEq = String(conditions?.sentiment ?? "").toLowerCase();
  const referralSentMustBe = conditions?.referralSent;

  const endCustomers = await prisma.endCustomer.findMany({ where: { customerId: customer.id } });
  const reasons: Record<string, number> = {};
  let eligible = 0;
  let suppressed = 0;

  for (const ec of endCustomers) {
    const attrs = (ec.attributes || {}) as any;
    const rating = Number(attrs?.rating);
    const sentiment = String(attrs?.sentiment || "").toLowerCase();
    const referralSent = Boolean(attrs?.referralSent);

    let reason: string | null = null;
    if (!Number.isFinite(rating)) reason = "missing_rating";
    else if (ratingGte && rating < ratingGte) reason = `rating_below_${ratingGte}`;
    else if (sentimentEq && sentiment !== sentimentEq) reason = "non_matching_sentiment";
    else if (typeof referralSentMustBe === "boolean" && referralSent !== referralSentMustBe) reason = "referral_state_mismatch";

    if (reason) {
      suppressed += 1;
      reasons[reason] = (reasons[reason] || 0) + 1;
    } else {
      eligible += 1;
    }
  }

  const snap = await prisma.segmentSnapshot.create({
    data: {
      customerId: customer.id,
      ruleSetId: ruleSet.id,
      size: eligible,
      suppressed,
      reasons: reasons as any,
    },
  });

  await prisma.activityEvent.create({
    data: {
      customerId: customer.id,
      kind: "segment_snapshot_created",
      summary: `Segment preview created for rule: ${ruleSet.name} (eligible ${eligible}, suppressed ${suppressed}).`,
      payload: { ruleSetId: ruleSet.id, segmentSnapshotId: snap.id, reasons },
    },
  });

  return Response.json({ ok: true, ruleSet: { id: ruleSet.id, name: ruleSet.name }, snapshot: snap });
}


