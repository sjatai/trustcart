import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { prisma } from "@/lib/db";
import { allowedActionsForTrust } from "@/lib/policy";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runTrust(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("TrustAgent");
  step.read.push("Birdeye trust signals: reviews/sentiment, responsiveness proxies, recency, risk (demo).");
  step.decide.push("Compute trust score snapshot and allowed actions based on thresholds.");
  step.do.push("Gate automation actions (reviews/referrals/campaigns) and produce policy decisions.");
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
  step.receipts.push(receipt("trust_score", `Trust score: ${snapshot.total}/100 (${policy.zone}).`, snapshot.id));
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
