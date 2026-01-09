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

  const latest = await prisma.trustScoreSnapshot.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });

  const snapshot =
    latest ||
    (await prisma.trustScoreSnapshot.create({
      data: {
        customerId: customer.id,
        total: 70,
        experience: 70,
        responsiveness: 70,
        stability: 70,
        recency: 70,
        risk: 70,
      },
    }));

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
