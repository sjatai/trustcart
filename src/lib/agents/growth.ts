import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { prisma } from "@/lib/db";
import { allowedActionsForTrust } from "@/lib/policy";
import { writeReceipt } from "@/lib/receipts";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runGrowth(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("GrowthAgent");
  step.read.push("Intent graph + trust score + available Trust Pack assets (demo).");

  if (state.command === "launch_campaign") {
    step.decide.push("Create campaign rule + compute eligible vs suppressed with reasons; default to dry-run; ensure trust gating passes.");
    step.do.push("Persist RuleSet, SegmentSnapshot, Campaign, SendReceipts; write canonical receipts.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    const msg = (state.userMessage || "").toLowerCase();

    // Flow 6: “Create campaign rule: rating>=5 + positive sentiment + not received referral; dry-run only”
    const ruleName = msg.includes("referral") ? "Referral advocates (rating>=5, positive, not yet referred)" : "Campaign rule";
    const ruleJson =
      msg.includes("rating") || msg.includes("sentiment") || msg.includes("referral")
        ? {
            kind: "referral_advocates",
            conditions: { ratingGte: 5, sentiment: "positive", referralSent: false },
            mode: "dry_run",
          }
        : { kind: "generic", mode: "dry_run" };

    const ruleSet = await prisma.ruleSet.create({
      data: {
        customerId: customer.id,
        name: ruleName,
        description: "dry-run only; eligible vs suppressed with reasons",
        json: ruleJson as any,
        active: true,
      },
    }).catch(async (err) => {
      // Idempotency: RuleSet has @@unique([customerId, name]). If it already exists, update+reuse it.
      const existing = await prisma.ruleSet.findFirst({ where: { customerId: customer.id, name: ruleName } });
      if (!existing) throw err;
      return prisma.ruleSet.update({
        where: { id: existing.id },
        data: {
          description: "dry-run only; eligible vs suppressed with reasons",
          json: ruleJson as any,
          active: true,
        },
      });
    });

    const trust = await prisma.trustScoreSnapshot.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    });
    const total = trust?.total ?? 70;
    const policy = allowedActionsForTrust(total);

    step.receipts.push(receipt("policy_checked", `Policy checked: trust ${total}/100 (${policy.zone}).`));
    await writeReceipt({
      customerId: customer.id,
      kind: "DECIDE",
      actor: "TRUST_ENGINE",
      summary: "Policy checked for growth execution",
      input: { trustTotal: total },
      output: { zone: policy.zone, allowed: policy.allowed, blocked: policy.blocked },
    });
    if (policy.zone === "UNSAFE") {
      step.decide.push("Blocked: trust zone UNSAFE.");
      step.receipts.push(receipt("policy_block", "Campaign creation blocked by trust policy (UNSAFE)."));
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "campaign_blocked",
          summary: "Campaign blocked by trust policy (UNSAFE).",
          payload: { trustTotal: total, policy },
        },
      });
      return { step, patch: {} };
    }

    // Real segmentation against EndCustomer table (no fake sizes).
    // Demo convenience: if this is a brand-new customer (e.g. test shadow domain), seed a small deterministic set.
    let endCustomers = await prisma.endCustomer.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "asc" },
    });
    if (endCustomers.length === 0) {
      const demo = [
        { email: "ava.advocate@example.com", rating: 5, sentiment: "positive", referralSent: false },
        { email: "sam.suppressed@example.com", rating: 4, sentiment: "positive", referralSent: false },
        { email: "pat.neutral@example.com", rating: 5, sentiment: "neutral", referralSent: false },
        { email: "riley.referred@example.com", rating: 5, sentiment: "positive", referralSent: true },
      ];
      await prisma.endCustomer.createMany({
        data: demo.map((d) => ({
          customerId: customer.id,
          email: d.email,
          attributes: { rating: d.rating, sentiment: d.sentiment, referralSent: d.referralSent } as any,
        })),
        skipDuplicates: true,
      });
      endCustomers = await prisma.endCustomer.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "asc" },
      });
    }

    const reasons: Record<string, number> = {};
    const eligible: Array<{ email: string }> = [];
    const suppressed: Array<{ email: string; reason: string }> = [];

    for (const ec of endCustomers) {
      const attrs = (ec.attributes || {}) as any;
      const rating = Number(attrs?.rating);
      const sentiment = String(attrs?.sentiment || "").toLowerCase();
      const referralSent = Boolean(attrs?.referralSent);

      let reason: string | null = null;
      if (!Number.isFinite(rating)) reason = "missing_rating";
      else if (rating < 5) reason = "rating_below_5";
      else if (sentiment !== "positive") reason = "non_positive_sentiment";
      else if (referralSent) reason = "already_referred";

      if (reason) {
        suppressed.push({ email: ec.email, reason });
        reasons[reason] = (reasons[reason] || 0) + 1;
      } else {
        eligible.push({ email: ec.email });
      }
    }

    const segmentSnapshot = await prisma.segmentSnapshot.create({
      data: {
        customerId: customer.id,
        ruleSetId: ruleSet.id,
        size: eligible.length,
        suppressed: suppressed.length,
        reasons: reasons as any,
      },
    });

    await writeReceipt({
      customerId: customer.id,
      kind: "DECIDE",
      actor: "RULE_ENGINE",
      summary: "Segment computed for campaign rule",
      input: { ruleSetId: ruleSet.id, rule: ruleSet.json },
      output: { eligible: eligible.length, suppressed: suppressed.length, reasons },
    });

    step.receipts.push(
      receipt(
        "segment_snapshot_created",
        `Segment snapshot created for ${ruleSet.name}: eligible ${eligible.length}, suppressed ${suppressed.length}.`,
        segmentSnapshot?.id
      )
    );

    const campaign = await prisma.campaign.create({
      data: {
        customerId: customer.id,
        ruleSetId: ruleSet.id,
        name: `Dry-run: ${ruleSet.name}`,
        goal: "Trust-gated execution (dry-run only)",
        status: "READY",
        dryRun: true,
        requiresApproval: false,
        segmentSize: eligible.length,
        suppressedSize: suppressed.length,
        gatingSummary: { policy, trustTotal: total, reasons, dryRun: true } as any,
        messages: {
          create: {
            channel: "email",
            subject: `Dry-run: ${ruleSet.name}`,
            body: "This is a dry-run campaign generated by TrustEye. No messages were sent.",
            payload: { kind: "growth", ruleSetId: ruleSet.id, dryRun: true } as any,
          },
        },
      },
      include: { messages: true },
    });

    const to = eligible.slice(0, 50).map((e) => e.email);
    for (const recipient of to) {
      await prisma.sendReceipt.create({
        data: {
          campaignId: campaign.id,
          status: "DRY_RUN",
          to: recipient,
          channel: "email",
          provider: "dry_run",
          payload: { campaignId: campaign.id, ruleSetId: ruleSet.id, dryRun: true } as any,
        },
      });
    }

    for (const s of suppressed.slice(0, 200)) {
      await prisma.sendReceipt.create({
        data: {
          campaignId: campaign.id,
          status: "SUPPRESSED",
          to: s.email,
          channel: "email",
          provider: "dry_run",
          payload: { campaignId: campaign.id, ruleSetId: ruleSet.id, suppressed: true, reason: s.reason } as any,
        },
      });
    }

    step.receipts.push(receipt("campaign_created", `Campaign created (dry-run): ${campaign.name}.`, campaign.id));
    step.receipts.push(receipt("receipts_written", `SendReceipts written: DRY_RUN=${to.length}, SUPPRESSED=${Math.min(200, suppressed.length)}.`));

    await writeReceipt({
      customerId: customer.id,
      kind: "EXECUTE",
      actor: "DELIVERY",
      summary: "Dry-run delivery executed (no sends)",
      input: { campaignId: campaign.id, channel: "email", dryRun: true },
      output: { dryRunCount: to.length, suppressedCount: suppressed.length },
    });

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "campaign",
        summary: `Campaign created (dry-run) from ruleset ${ruleSet.name}. Eligible ${to.length}, suppressed ${suppressed.length}.`,
        payload: { campaignId: campaign.id, ruleSetId: ruleSet.id, trustTotal: total, policy, segmentSnapshotId: segmentSnapshot?.id },
      },
    });
  } else {
    step.decide.push("No Growth execution required for this command.");
  }

  return { step, patch: {} };
}
