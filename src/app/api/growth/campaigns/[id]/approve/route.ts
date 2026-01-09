import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: { approvedAt: new Date(), approvedBy: "demo_manager" },
  });
  await prisma.activityEvent.create({
    data: {
      customerId: campaign.customerId,
      kind: "manager_approved",
      summary: `Manager approved campaign ${campaign.name}.`,
      payload: { campaignId: campaign.id, approvedBy: "demo_manager" },
    },
  });
  return Response.json({ ok: true, campaign });
}


