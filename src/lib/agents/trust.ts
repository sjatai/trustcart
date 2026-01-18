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

export async function runTrust(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("TrustAgent");
  step.read.push("System Trust (execution readiness): experience, responsiveness, stability, recency, risk.");
  step.read.push("Consumer Trust is computed in Content/Publish steps (separate).");
  step.decide.push("Compute System Trust score snapshot and allowed actions based on thresholds.");
  step.do.push("Gate automation actions and return policy decisions for other agents.");
  const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
  const customer = await getOrCreateCustomerByDomain(domain);

  // Real (non-fake) trust signals derived from persisted system activity.
  const [lastCrawl, evidenceCount, receiptCount, publishedAssets, latestClaim] = await Promise.all([
    prisma.crawlRun.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
    prisma.evidence.count({ where: { claim: { customerId: customer.id } } }),
    prisma.receipt.count({ where: { customerId: customer.id } }),
    prisma.asset.count({ where: { customerId: customer.id, status: "PUBLISHED" } }),
    prisma.claim.findFirst({ where: { customerId: customer.id, freshnessAt: { not: null } }, orderBy: { freshnessAt: "desc" } }),
  ]);

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const recencyDays = latestClaim?.freshnessAt ? (Date.now() - latestClaim.freshnessAt.getTime()) / (24 * 60 * 60 * 1000) : null;
  const recency =
    recencyDays == null ? 30 : recencyDays <= 7 ? 90 : recencyDays <= 30 ? 75 : recencyDays <= 90 ? 55 : 35;

  const stability = clamp(
    35 +
      (lastCrawl?.status === "COMPLETED" ? 35 : 0) +
      (lastCrawl?.status === "FAILED" ? -10 : 0) +
      (lastCrawl?.error ? -5 : 0)
  );
  const experience = clamp(35 + Math.min(45, (evidenceCount / 60) * 45) + (publishedAssets > 0 ? 10 : 0));
  const responsiveness = clamp(30 + Math.min(60, (receiptCount / 80) * 60));
  const risk = clamp(40 + (publishedAssets > 0 ? 10 : 0) + Math.min(30, (evidenceCount / 80) * 30));
  const total = clamp((experience + responsiveness + stability + recency + risk) / 5);

  const snapshot = await prisma.trustScoreSnapshot.create({
    data: {
      customerId: customer.id,
      total,
      experience,
      responsiveness,
      stability,
      recency,
      risk,
    },
  });

  const policy = allowedActionsForTrust(snapshot.total);

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "TRUST_ENGINE",
    summary: "System trust score computed",
    input: { domain },
    output: { trustTotal: snapshot.total, zone: policy.zone, allowed: policy.allowed },
  });

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "TRUST_ENGINE",
    summary: "Policy gates resolved",
    output: { zone: policy.zone, allowed: policy.allowed, blocked: policy.blocked },
  });

  step.receipts.push(receipt("system_trust", `System Trust: ${snapshot.total}/100 (${policy.zone}).`, snapshot.id));
  step.receipts.push(receipt("policy", `Allowed: ${policy.allowed.slice(0, 4).join(", ")}${policy.allowed.length > 4 ? "…" : ""}`));

  await prisma.activityEvent.create({
    data: {
      customerId: customer.id,
      kind: "policy",
      summary: `Policy computed: zone ${policy.zone}, trust ${snapshot.total}/100.`,
      payload: { trustScoreSnapshotId: snapshot.id, policy },
    },
  });

  return { step, patch: {} };
}
