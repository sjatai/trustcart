import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { getOrCreateSessionId } from "@/lib/session";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapExperienceToIntent(experience?: string): { primaryIntent: string; recommendedExperience: string } {
  const x = String(experience || "");
  if (x === "trade_in_value") return { primaryIntent: "trade_in_value", recommendedExperience: "trade_in_value" };
  if (x === "bad_credit_financing") return { primaryIntent: "bad_credit_financing", recommendedExperience: "bad_credit_financing" };
  if (x === "service_specials") return { primaryIntent: "service_specials", recommendedExperience: "service_specials" };
  if (x === "test_drive") return { primaryIntent: "test_drive", recommendedExperience: "test_drive" };
  return { primaryIntent: "unknown", recommendedExperience: "unknown" };
}

export async function GET(req: Request) {
  try {
    // Ensure we have a real session id (and set it if missing) instead of a placeholder like "anonymous".
    const sessionId = await getOrCreateSessionId();

    const url = new URL(req.url);
    const qpDomain = url.searchParams.get("domain")?.trim();

    const customerDomain = qpDomain || getDomainFromRequest(req) || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnysteps.com";
    const customer = await getCustomerByDomain(customerDomain).catch(() => null);

    const lastEvents = await prisma.event.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    const lastFeatured = lastEvents.find((e) => e.type === "featured_experience_click");
    const experience = (lastFeatured?.data as any)?.experience;
    const mapped = mapExperienceToIntent(experience);
    const confidence = mapped.primaryIntent === "unknown" ? 0 : 78;

    const auditSummary =
      mapped.primaryIntent === "unknown"
        ? "No high-confidence intent signals yet. Click a Featured Experience chip to generate session events."
        : `Primary intent inferred from recent featured experience: ${mapped.primaryIntent}.`;

    return Response.json({
      sessionId,
      primaryIntent: mapped.primaryIntent,
      confidence,
      lastEvents: lastEvents.map((e) => ({
        id: e.id,
        type: e.type,
        createdAt: e.createdAt,
        data: e.data,
      })),
      recommendedExperience: mapped.recommendedExperience,
      auditSummary,
      customer: customer ? { id: customer.id, domain: customer.domain } : { domain: customerDomain },
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/graph/session" }));
    }
    throw err;
  }
}
