import { prisma } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { env } from "@/lib/env";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postSlack(text: string, fields?: Record<string, string>) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;

  const payload: any = { text };
  if (fields && Object.keys(fields).length) {
    payload.attachments = [
      {
        color: "#2eb67d",
        fields: Object.entries(fields).map(([title, value]) => ({
          title,
          value,
          short: true,
        })),
      },
    ];
  }

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const type: string = body?.type ?? "unknown";
    const data = body?.data ?? {};
    const url = new URL(req.url);
    const customerDomain: string =
      url.searchParams.get("domain") ||
      body?.customerDomain ||
      getDomainFromRequest(req) ||
      env.NEXT_PUBLIC_DEMO_DOMAIN ||
      "sunnysteps.com";

    // Special-case: site intent events (client sends { type: "site_intent", intent, event }).
    const intent: string | undefined = body?.intent;
    const ev: any = body?.event;

    const isHoursIntent = type === "site_intent" && (ev?.label === "hours" || ev?.label === "Hours");
    const page: string | undefined = ev?.page;

    const customer = await getCustomerByDomain(customerDomain).catch(() => null);
    if (!customer) return Response.json({ ok: false, error: "customer_not_found", domain: customerDomain }, { status: 404 });

    if (isHoursIntent) {
      await writeReceipt({
        customerId: customer.id,
        kind: "EXECUTE",
        actor: "INTENT_ENGINE",
        summary: "High intent: hours opened → recommend appointment",
        input: { intent, event: ev, page },
      });

      await postSlack(
        `High intent detected (${customerDomain}): Hours viewed → recommend appointment booking.`,
        page ? { page } : undefined
      );
    }

    const sessionId = await getOrCreateSessionId();

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
  } catch {
    // Never fail the build: Next may evaluate route handlers during "collect page data".
    return Response.json({ ok: false, error: "events_failed", route: "/api/events" }, { status: 200 });
  }
}
