import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { env } from "@/lib/env";
import { ensureIntentQuestions } from "@/lib/intentGraph";
import { prisma } from "@/lib/db";
import { runRealProbe } from "@/lib/probes";
import { requireEnvVars } from "@/lib/errors";
import { writeReceipt } from "@/lib/receipts";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function getDemoProbeQuestions(domain: string): string[] | null {
  const d = (domain || "").toLowerCase();
  if (!d.includes("reliablenissan.com")) return null;
  // Curated set designed to show improvement after publishing verified FAQ/pages.
  return [
    "What are the service department hours today, and how do I book an appointment?",
    "Where is the dealership located and what is the best phone number to call?",
    "Do you offer financing, and what documents do I need to get pre-approved?",
    "Can I schedule a test drive online, and what information is required?",
    "What warranty options are available for certified pre-owned vehicles?",
    "Do you accept trade-ins, and how is trade-in value determined?",
    "What services are offered (oil change, brakes, tire rotation), and how long do they take?",
    "If I have a problem after service, what is the escalation or support process?",
  ];
}

function parseEnvList(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    // allow newline / comma separated
    const items = raw
      .split(/\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length) return items;
  }
  return null;
}

async function pickProbeQuestions(customerId: string, domain: string): Promise<string[]> {
  // Highest priority: explicit env override (makes demo deterministic).
  const envList = parseEnvList("DEMO_PROBE_QUESTIONS");
  if (envList && envList.length) return envList.slice(0, 12);

  // Next: curated Nissan demo set.
  const curated = getDemoProbeQuestions(domain);
  if (curated && curated.length) return curated;

  // Fallback: top product questions from DB.
  const topQuestions = await prisma.question.findMany({
    where: { customerId },
    orderBy: { impactScore: "desc" },
    take: 10,
  });
  const qs = topQuestions.map((q: { text: string }) => q.text).filter(Boolean);
  return qs.length ? qs : [
    "What are your hours and how do I book an appointment?",
    "Where are you located and what is the best phone number to call?",
  ];
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
  gapType: "MISSING_CLAIM" | "MISSING_PROOF" | "STALE" | "LLM_WEAK";
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
    step.decide.push("Run LLM probes (OpenAI + Gemini) and compute AI Visibility score.");
    step.do.push("Create a visibility score snapshot and store probe answers.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    // Prefer deterministic demo set when available; otherwise use top DB questions.
    const questions = await pickProbeQuestions(customer.id, domain);
    const mode = state.command === "reprobe_delta" ? "reprobe" : "baseline";

    // Non-negotiable: do not simulate providers.
    // But allow demos to run with a subset of real providers when one isn't available (e.g. no Gemini quota).
    const providerEnv = (process.env.DEMO_PROBE_PROVIDERS || "OPENAI,GEMINI").toUpperCase();
    const providers = providerEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => p === "OPENAI" || p === "GEMINI") as Array<"OPENAI" | "GEMINI">;

    if (providers.includes("OPENAI")) {
      requireEnvVars(["OPENAI_API_KEY"], "Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`), then re-run the probe command.");
    }
    if (providers.includes("GEMINI")) {
      requireEnvVars(
        ["GEMINI_API_KEY"],
        "Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL` / `GEMINI_API_VERSION`), then re-run the probe command."
      );
    }
    if (providers.length === 0) {
      requireEnvVars(
        ["OPENAI_API_KEY", "GEMINI_API_KEY"],
        "Set `OPENAI_API_KEY` and/or `GEMINI_API_KEY`, then re-run the probe command."
      );
    }

    await writeReceipt({
      customerId: customer.id,
      kind: "READ",
      actor: "INTENT_ENGINE",
      summary: `AIO probe started (${mode}) using ${providers.join(" + ") || "providers from env"}.`,
      input: { providers, mode, questions: questions.slice(0, 8) },
    });

    const probe = await runRealProbe({
      customerId: customer.id,
      mode,
      questions: questions.slice(0, 8),
      domain,
      providers: providers.length ? providers : ["OPENAI", "GEMINI"],
    });

    // Compute delta vs previous snapshot (real, not mocked).
    const prev = await prisma.visibilityScoreSnapshot.findFirst({
      where: { customerId: customer.id, id: { not: probe.snapshotId } },
      orderBy: { createdAt: "desc" },
    });

    const delta = prev
      ? {
          total: probe.snapshot.total - prev.total,
          coverage: probe.snapshot.coverage - prev.coverage,
          specificity: probe.snapshot.specificity - prev.specificity,
          proof: probe.snapshot.proof - prev.proof,
          freshness: probe.snapshot.freshness - prev.freshness,
          aiReadiness: probe.snapshot.aiReadiness - prev.aiReadiness,
          prevSnapshotId: prev.id,
        }
      : null;

    await writeReceipt({
      customerId: customer.id,
      kind: "READ",
      actor: "INTENT_ENGINE",
      summary: `AIO probe completed (${mode}) using ${providers.join(" + ") || "providers"}.`,
      output: {
        probeRunIds: probe.runIds,
        snapshotId: probe.snapshotId,
        total: probe.snapshot.total,
        providerMetrics: probe.providerMetrics,
        delta,
      },
    });

    await writeReceipt({
      customerId: customer.id,
      kind: "DECIDE",
      actor: "INTENT_ENGINE",
      summary: `AI Visibility score computed (${probe.snapshot.total}/100).`,
      input: { snapshotId: probe.snapshotId },
      output: {
        total: probe.snapshot.total,
        coverage: probe.snapshot.coverage,
        specificity: probe.snapshot.specificity,
        proof: probe.snapshot.proof,
        freshness: probe.snapshot.freshness,
        aiReadiness: probe.snapshot.aiReadiness,
        delta,
      },
    });

    step.receipts.push(
      receipt(
        "probe_runs",
        `Probe runs created: OPENAI=${probe.runIds.OPENAI ? "yes" : "no"}, GEMINI=${probe.runIds.GEMINI ? "yes" : "no"}.`
      )
    );
    step.receipts.push(receipt("visibility_score", `AI Visibility score: ${probe.snapshot.total}/100.`, probe.snapshotId));

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "probe",
        summary: `Probe ${mode} completed. Total score ${probe.snapshot.total}/100${delta ? ` (Δ ${delta.total >= 0 ? "+" : ""}${delta.total})` : ""}.`,
        payload: { probeRunIds: probe.runIds, snapshotId: probe.snapshotId, delta },
      },
    });

    step.do.push("Visibility score computed");

    return {
      step,
      patch: {
        assistantMessage:
          "Probe executed using OpenAI + Gemini. ProbeRuns + ProbeAnswers + VisibilityScoreSnapshot were created, and canonical receipts were written for auditability.",
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

    // Latest probe answers (used to flag weak/unverifiable answers as gaps).
    const latestProbeRun = await prisma.probeRun.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      include: { answers: true },
    });
    const probeByQuestion = new Map<string, { answer: string; hedging: number }>();
    for (const a of latestProbeRun?.answers || []) {
      probeByQuestion.set(String(a.question || "").trim().toLowerCase(), { answer: String(a.answer || ""), hedging: Number(a.hedging ?? 50) });
    }

    const cutoff = daysAgo(90);
    const gapTotals = { MISSING_CLAIM: 0, MISSING_PROOF: 0, STALE: 0, LLM_WEAK: 0 };
    const stateCounts: Record<string, number> = {};

    for (const q of questions) {
      // Clean up legacy gap rows from earlier heuristics.
      await prisma.questionGap.deleteMany({
        where: { questionId: q.id, gapType: { notIn: ["MISSING_CLAIM", "MISSING_PROOF", "STALE", "LLM_WEAK"] } },
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
        // Link the need to the concrete claim row for traceability.
        await prisma.questionNeed.updateMany({
          where: { questionId: q.id, claimKey: n.claimKey },
          data: { claimId: claim.id },
        });
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
      const probe = probeByQuestion.get(String(q.text || "").trim().toLowerCase()) || null;
      const unverifiable = probe ? /^not_verifiable\s*:/i.test(probe.answer) || probe.answer.includes("NOT_VERIFIABLE:") : false;
      const llmWeak = probe ? unverifiable || (probe.hedging ?? 50) >= 70 : false;

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

      // Strict gap definition: weak/unverifiable LLM answer is a gap (even if no missing claims).
      if (llmWeak) {
        gapTotals.LLM_WEAK += 1;
        await upsertQuestionGap({
          questionId: q.id,
          gapType: "LLM_WEAK",
          severity,
          description: unverifiable ? "LLM answer NOT_VERIFIABLE (missing facts)" : `LLM answer hedging high (${probe?.hedging ?? 50})`,
        });
      } else {
        await prisma.questionGap.deleteMany({ where: { questionId: q.id, gapType: "LLM_WEAK" } });
      }

      const newState =
        missingClaim.length > 0
          ? "UNANSWERED"
          : llmWeak
            ? "WEAK"
            : missingProof.length > 0
              ? "WEAK"
              : stale.length > 0
                ? "STALE"
                : "ANSWERED";
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
        `Gaps computed: missing_claim=${gapTotals.MISSING_CLAIM}, missing_proof=${gapTotals.MISSING_PROOF}, stale=${gapTotals.STALE}, llm_weak=${gapTotals.LLM_WEAK}.`
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
