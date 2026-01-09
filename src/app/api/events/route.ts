import { prisma } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const type: string = body?.type ?? "unknown";
  const data = body?.data ?? {};
  const customerDomain: string = body?.customerDomain ?? env.NEXT_PUBLIC_DEMO_DOMAIN ?? "reliablenissan.com";

  const sessionId = await getOrCreateSessionId();

  const customer = await prisma.customer.upsert({
    where: { domain: customerDomain },
    update: {},
    create: { name: "Reliable Nissan", domain: customerDomain },
  });

  await prisma.session.upsert({
    where: { id: sessionId },
    update: {},
    create: { id: sessionId, customerId: customer.id },
  });

  const event = await prisma.event.create({
    data: {
      sessionId,
      type,
      data,
    },
  });

  return Response.json({
    ok: true,
    sessionId,
    customerDomain,
    event: { id: event.id, type: event.type, createdAt: event.createdAt },
  });
}
