import { prisma } from "@/lib/db";
import { allowedActionsForTrust } from "@/lib/policy";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return Response.json({ ok: false, error: "campaign_not_found" }, { status: 404 });

  const trust = await prisma.trustScoreSnapshot.findFirst({
    where: { customerId: campaign.customerId },
    orderBy: { createdAt: "desc" },
  });
  const trustTotal = trust?.total ?? 70;
  const policy = allowedActionsForTrust(trustTotal);

  if (campaign.requiresApproval && !campaign.approvedAt) {
    return Response.json({ ok: false, error: "requires_approval", message: "Campaign requires manager approval before execution." }, { status: 400 });
  }
  if (policy.zone === "UNSAFE") {
    return Response.json({ ok: false, error: "policy_block", message: "Trust policy blocked execution (UNSAFE)." }, { status: 400 });
  }

  // Execute only safe segment: mark receipts SENT for non-suppressed count.
  const toSend = await prisma.sendReceipt.findMany({ where: { campaignId: campaign.id, status: "DRY_RUN" } });
  for (const r of toSend) {
    await prisma.sendReceipt.update({ where: { id: r.id }, data: { status: "SENT" } });
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { dryRun: false, status: "EXECUTED", executedAt: new Date(), gatingSummary: { policy, trustTotal, executed: true } as any },
  });

  await prisma.activityEvent.create({
    data: {
      customerId: updated.customerId,
      kind: "campaign_executed",
      summary: `Executed safe segment (sent ${toSend.length}).`,
      payload: { campaignId: updated.id, sent: toSend.length, policy, trustTotal },
    },
  });

  return Response.json({ ok: true, campaign: updated, sent: toSend.length });
}


