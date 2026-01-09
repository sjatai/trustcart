import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { env } from "@/lib/env";
import { ensureIntentQuestions } from "@/lib/intentGraph";
import { prisma } from "@/lib/db";
import { runSimulatedProbe } from "@/lib/probes";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

type CanonicalReceiptKind = "READ" | "DECIDE" | "EXECUTE" | "PUBLISH" | "SUPPRESS";
type CanonicalReceiptActor =
  | "CRAWLER"
  | "ORCHESTRATOR"
  | "INTENT_ENGINE"
  | "TRUST_ENGINE"
  | "CONTENT_ENGINE"
  | "RULE_ENGINE"
  | "DELIVERY";

const ReceiptKind: Record<CanonicalReceiptKind, CanonicalReceiptKind> = {
  READ: "READ",
  DECIDE: "DECIDE",
  EXECUTE: "EXECUTE",
  PUBLISH: "PUBLISH",
  SUPPRESS: "SUPPRESS",
};

const ReceiptActor: Record<CanonicalReceiptActor, CanonicalReceiptActor> = {
  CRAWLER: "CRAWLER",
  ORCHESTRATOR: "ORCHESTRATOR",
  INTENT_ENGINE: "INTENT_ENGINE",
  TRUST_ENGINE: "TRUST_ENGINE",
  CONTENT_ENGINE: "CONTENT_ENGINE",
  RULE_ENGINE: "RULE_ENGINE",
  DELIVERY: "DELIVERY",
};

async function upsertQuestionGap(args: {
  questionId: string;
  gapType: "MISSING_CLAIM" | "MISSING_PROOF" | "STALE";
  severity: number;
  description: string;
}) {
  const existing = await prisma.questionGap.findFirst({
    where: { questionId: args.questionId, gapType: args.gapType },
  });

  if (existing) {
    return prisma.questionGap.update({
      where: { id: existing.id },
      data: {
        severity: args.severity,
        description: args.description,
      },
    });
  }

  return prisma.questionGap.create({
    data: {
      questionId: args.questionId,
      gapType: args.gapType,
      severity: args.severity,
      description: args.description,
    },
  });
}

export async function runAIO(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("AIOAgent");
  step.read.push("Top questions, knowledge graph claims (if present), probe history (if present).");

  // Scene 3: LLM Readiness commands
  if (["probe", "reprobe_delta"].includes(state.command)) {
    step.decide.push("Run LLM probes (ChatGPT + Gemini) or simulated probes if keys missing.");
    step.do.push("Create a visibility score snapshot and store probe answers.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    const topQuestions = await prisma.question.findMany({
      where: { customerId: customer.id },
      orderBy: { impactScore: "desc" },
      take: 8,
    });
    const questions = topQuestions.map((q: { text: string }) => q.text);
    const mode = state.command === "reprobe_delta" ? "reprobe" : "baseline";

    // Canonical receipt: deterministic + auditable probe kickoff
    await prisma.receipt.create({
      data: {
        customerId: customer.id,
        kind: ReceiptKind.READ,
        actor: ReceiptActor.INTENT_ENGINE,
        summary: `Probe started (${mode}) in SIMULATED mode.`,
        input: { provider: "SIMULATED", mode, questions: questions.slice(0, 8) } as any,
        output: {} as any,
      },
    });

    // Deterministic fallback (demo-safe). If keys are present later, swap to real providers.
    const probe = await runSimulatedProbe({ customerId: customer.id, mode, questions });

    // Canonical receipts: probe results + visibility score
    await prisma.receipt.create({
      data: {
        customerId: customer.id,
        kind: ReceiptKind.READ,
        actor: ReceiptActor.INTENT_ENGINE,
        summary: `Probe completed (${mode}) in SIMULATED mode.`,
        input: { probeRunId: probe.probeRunId } as any,
        output: { snapshotId: probe.snapshotId, total: probe.snapshot.total } as any,
      },
    });

    await prisma.receipt.create({
      data: {
        customerId: customer.id,
        kind: ReceiptKind.DECIDE,
        actor: ReceiptActor.INTENT_ENGINE,
        summary: `Visibility score computed (${probe.snapshot.total}/100).`,
        input: { snapshotId: probe.snapshotId } as any,
        output: {
          total: probe.snapshot.total,
          coverage: probe.snapshot.coverage,
          specificity: probe.snapshot.specificity,
          proof: probe.snapshot.proof,
          freshness: probe.snapshot.freshness,
          aiReadiness: probe.snapshot.aiReadiness,
        } as any,
      },
    });

    step.receipts.push(receipt("probe_run", `Probe run created (${mode}, simulated).`, probe.probeRunId));
    step.receipts.push(receipt("visibility_score", `AI Visibility score: ${probe.snapshot.total}/100.`, probe.snapshotId));

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "probe",
        summary: `Probe ${mode} completed (simulated). Total score ${probe.snapshot.total}/100.`,
        payload: { probeRunId: probe.probeRunId, snapshotId: probe.snapshotId },
      },
    });

    step.do.push("Visibility score computed");

    return {
      step,
      patch: {
        assistantMessage:
          "Probe executed in SIMULATED mode (no provider keys configured). ProbeRun + ProbeAnswers + VisibilityScoreSnapshot were created, and canonical receipts were written for auditability.",
      },
    };
  }
  // Scene 2: Intent Graph commands
  else if (["intent_graph"].includes(state.command)) {
    step.decide.push("Generate/update intent/question graph and node states.");
    step.do.push("Compute gaps & why (missing claim, missing proof, stale) and persist QuestionGap + Question.state.");
    step.do.push("Intent graph updated");
    step.do.push("Gaps identified with reasons");

    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    // Ensure baseline question bank exists (creates Question + QuestionNeed rows).
    await ensureIntentQuestions(customer.id);

    const questions = await prisma.question.findMany({
      where: { customerId: customer.id },
      include: { needs: true },
      orderBy: { impactScore: "desc" },
      take: 200,
    });

    const claims = await prisma.claim.findMany({
      where: { customerId: customer.id },
      select: {
        id: true,
        key: true,
        freshnessAt: true,
        _count: { select: { evidence: true } },
      },
    });
    const claimByKey = new Map<string, { id: string; freshnessAt: Date | null; evidenceCount: number }>();
    for (const c of claims) {
      claimByKey.set(c.key, { id: c.id, freshnessAt: c.freshnessAt ?? null, evidenceCount: c._count.evidence });
    }

    const cutoff = daysAgo(90);
    const gapTotals = { MISSING_CLAIM: 0, MISSING_PROOF: 0, STALE: 0 };
    const stateCounts: Record<string, number> = {};

    for (const q of questions) {
      // Clean up legacy gap rows from earlier heuristics.
      await prisma.questionGap.deleteMany({
        where: { questionId: q.id, gapType: { notIn: ["MISSING_CLAIM", "MISSING_PROOF", "STALE"] } },
      });

      // Tighten TS for noImplicitAny environments.
      const requiredNeeds = (q.needs || []).filter((n: { required: boolean }) => n.required) as Array<{ required: boolean; claimKey: string }>;
      const missingClaim: string[] = [];
      const missingProof: string[] = [];
      const stale: string[] = [];

      for (const n of requiredNeeds) {
        const claim = claimByKey.get(n.claimKey);
        if (!claim) {
          missingClaim.push(n.claimKey);
          continue;
        }
        if ((claim.evidenceCount || 0) < 1) {
          missingProof.push(n.claimKey);
          continue;
        }
        if (claim.freshnessAt && claim.freshnessAt < cutoff) {
          stale.push(n.claimKey);
          continue;
        }
      }

      const severity = Math.min(95, Math.max(40, q.impactScore));

      if (missingClaim.length > 0) {
        gapTotals.MISSING_CLAIM += 1;
        await upsertQuestionGap({
          questionId: q.id,
          gapType: "MISSING_CLAIM",
          severity,
          description: `Missing claim(s): ${missingClaim.slice(0, 5).join(", ")}${missingClaim.length > 5 ? "…" : ""}`,
        });
      } else {
        await prisma.questionGap.deleteMany({ where: { questionId: q.id, gapType: "MISSING_CLAIM" } });
      }

      if (missingProof.length > 0) {
        gapTotals.MISSING_PROOF += 1;
        await upsertQuestionGap({
          questionId: q.id,
          gapType: "MISSING_PROOF",
          severity,
          description: `Claim exists but missing proof (evidence) for: ${missingProof.slice(0, 5).join(", ")}${
            missingProof.length > 5 ? "…" : ""
          }`,
        });
      } else {
        await prisma.questionGap.deleteMany({ where: { questionId: q.id, gapType: "MISSING_PROOF" } });
      }

      if (stale.length > 0) {
        gapTotals.STALE += 1;
        await upsertQuestionGap({
          questionId: q.id,
          gapType: "STALE",
          severity,
          description: `Claim(s) stale (>90d): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? "…" : ""}`,
        });
      } else {
        await prisma.questionGap.deleteMany({ where: { questionId: q.id, gapType: "STALE" } });
      }

      const newState =
        missingClaim.length > 0 ? "UNANSWERED" : missingProof.length > 0 ? "WEAK" : stale.length > 0 ? "STALE" : "ANSWERED";
      stateCounts[newState] = (stateCounts[newState] || 0) + 1;

      await prisma.question.update({
        where: { id: q.id },
        data: { state: newState as any },
      });
    }

    await prisma.receipt.create({
      data: {
        customerId: customer.id,
        kind: ReceiptKind.DECIDE,
        actor: ReceiptActor.INTENT_ENGINE,
        summary: `Intent graph refreshed + gaps computed for top ${questions.length} questions.`,
        input: { topN: questions.length, freshnessCutoffDays: 90 } as any,
        output: { states: stateCounts, gaps: gapTotals } as any,
      },
    });

    step.receipts.push(receipt("intent_graph", `Intent graph refreshed for ${questions.length} questions.`, customer.id));
    step.receipts.push(
      receipt(
        "gaps_computed",
        `Gaps computed: missing_claim=${gapTotals.MISSING_CLAIM}, missing_proof=${gapTotals.MISSING_PROOF}, stale=${gapTotals.STALE}.`
      )
    );

    return {
      step,
      patch: {
        assistantMessage:
          "Intent Graph refreshed. I computed gaps & why (missing claim vs missing proof vs stale) and persisted QuestionGap + Question.state. Canonical receipts were written for auditability.",
      },
    };
  } else {
    step.decide.push("No AIO actions required for this command.");
  }

  return { step, patch: {} };
}
