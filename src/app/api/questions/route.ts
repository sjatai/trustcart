import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const domain = getDomainFromRequest(req);
  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return Response.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });

  const latestProbe = await prisma.probeRun.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { answers: true },
  });
  const probeByQ = new Map<string, { answer: string; hedging: number }>();
  for (const a of latestProbe?.answers || []) {
    const k = String(a.question || "").trim().toLowerCase();
    if (!k) continue;
    probeByQ.set(k, { answer: String(a.answer || ""), hedging: Number(a.hedging ?? 50) });
  }

  const questions = await prisma.question.findMany({
    where: { customerId: customer.id },
    orderBy: { impactScore: "desc" },
    take: 200,
    include: {
      gaps: true,
      needs: true,
    },
  });

  // Audit receipt (READ)
  await writeReceipt({
    customerId: customer.id,
    kind: "READ",
    actor: "INTENT_ENGINE",
    summary: "Fetched discovery questions",
    input: { domain },
    output: { count: questions.length },
  });

  return Response.json({
    ok: true,
    customer: {
      id: customer.id,
      domain: customer.domain,
    },
    questions: questions.map((q) => ({
      // Gap definition for UI: missing site facts OR weak/unverifiable probe answers.
      // We compute it dynamically here so Demand Signals always shows correct “answer gap” counts.
      id: q.id,
      taxonomy: q.taxonomy,
      title: q.text,
      text: q.text,
      impactScore: q.impactScore,
      state: q.state,
      recommendedAssetType: q.recommendedAssetType,
      gaps: (function () {
        const needs = Array.isArray(q.needs) ? q.needs : [];
        const missingClaimKeys = needs.filter((n: any) => n?.required && !n?.claimId).map((n: any) => String(n.claimKey || "")).filter(Boolean);
        const probe = probeByQ.get(String(q.text || "").trim().toLowerCase()) || null;
        const probeAnswer = String(probe?.answer || "");
        const probeHedging = Number(probe?.hedging ?? 50);
        const probeUnverifiable = /^not_verifiable\s*:/i.test(probeAnswer) || probeAnswer.includes("NOT_VERIFIABLE:");
        const probeWeak = probeUnverifiable || probeHedging >= 70;

        const out: Array<{ id: string; gapType: string; severity: number; description: string }> = [];
        for (const k of missingClaimKeys.slice(0, 6)) {
          out.push({ id: `missing:${k}`, gapType: "SITE_MISSING", severity: 70, description: `Missing site fact: ${k}` });
        }
        if (probeWeak) {
          out.push({
            id: "probe:weak",
            gapType: probeUnverifiable ? "LLM_UNVERIFIABLE" : "LLM_WEAK",
            severity: 65,
            description: probeUnverifiable ? "LLM answer is unverifiable" : "LLM answer is weak/hedged",
          });
        }
        // If DB-backed QuestionGap rows exist, include them too (dedup by id).
        for (const g of q.gaps || []) {
          out.push({ id: g.id, gapType: g.gapType, severity: g.severity, description: g.description || "" });
        }
        const seen = new Set<string>();
        return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
      })(),
      needs: (q.needs || []).map((n) => ({
        claimKey: n.claimKey,
        required: n.required,
      })),
    })),
  });
}