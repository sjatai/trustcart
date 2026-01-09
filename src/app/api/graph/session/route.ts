import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

function mapExperienceToIntent(experience?: string): { primaryIntent: string; recommendedExperience: string } {
  const x = String(experience || "");
  if (x === "trade_in_value") return { primaryIntent: "trade_in_value", recommendedExperience: "trade_in_value" };
  if (x === "bad_credit_financing") return { primaryIntent: "bad_credit_financing", recommendedExperience: "bad_credit_financing" };
  if (x === "service_specials") return { primaryIntent: "service_specials", recommendedExperience: "service_specials" };
  if (x === "test_drive") return { primaryIntent: "test_drive", recommendedExperience: "test_drive" };
  return { primaryIntent: "unknown", recommendedExperience: "unknown" };
}

export async function GET() {
  try {
    const jar = await cookies();
    const sessionId = jar.get("trusteye_session")?.value || "anonymous";

    const customerDomain = env.NEXT_PUBLIC_DEMO_DOMAIN ?? "reliablenissan.com";
    const customer = await prisma.customer.findUnique({ where: { domain: customerDomain } });

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
