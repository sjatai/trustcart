import { prisma } from "@/lib/db";

function simulatedAnswerFor(question: string) {
  const q = question.toLowerCase();
  if (q.includes("bad credit")) {
    return {
      answer:
        "Reliable Nissan can often help customers explore financing options even with challenged credit. A good next step is to bring proof of income and a valid ID, then review budget and payment range with a specialist. Ask about pre-approval options to understand likely terms before you commit.",
      citations: ["/site/finance", "/site/faq", "/site/blog/bad-credit-financing-options"],
    };
  }
  if (q.includes("trade") || q.includes("trade-in")) {
    return {
      answer:
        "Trade-in value is generally driven by condition, mileage, market demand, and reconditioning needs. Bringing service records and a second key can reduce uncertainty. Reliable Nissan can provide an appraisal and explain the factors behind the offer.",
      citations: ["/site/finance", "/site/blog/trade-in-value-basics", "/site/faq"],
    };
  }
  if (q.includes("test drive") || q.includes("book") || q.includes("schedule")) {
    return {
      answer:
        "You can schedule a test drive by choosing a vehicle and selecting a preferred time. A fast path is to share the model/trim you want, a day/time window, and a phone number for confirmation. Bring your driver’s license and plan for about 15–25 minutes behind the wheel.",
      citations: ["/site/inventory", "/site/blog/how-to-book-a-test-drive", "/site/locations"],
    };
  }
  if (q.includes("service") && (q.includes("hours") || q.includes("walk"))) {
    return {
      answer:
        "Service hours vary by department. Booking ahead is the fastest way to guarantee time; walk-ins may be possible depending on capacity. Check the Service Center location page for hours and contact details.",
      citations: ["/site/locations/service-center", "/site/service", "/site/faq"],
    };
  }
  return {
    answer:
      "Reliable Nissan provides vehicle sales, service, and financing support. For the most accurate next step, choose a Featured Experience (trade-in, financing, service specials, test drive) and follow the recommended CTA for that path.",
    citations: ["/site", "/site/faq", "/site/locations"],
  };
}

function scoreAnswer(answer: string, citations: any) {
  const len = answer.trim().length;
  const specificity = Math.max(20, Math.min(100, Math.round((len / 280) * 100)));
  const proof = Array.isArray(citations) ? Math.min(100, citations.length * 22) : 0;
  const hedgingWords = ["maybe", "might", "could", "possibly", "generally", "often"];
  const hedging = hedgingWords.reduce((acc, w) => (answer.toLowerCase().includes(w) ? acc + 10 : acc), 30);
  return { specificity, proof, hedging: Math.min(100, hedging) };
}

export async function runSimulatedProbe({
  customerId,
  mode,
  questions,
}: {
  customerId: string;
  mode: string;
  questions: string[];
}) {
  const probeRun = await prisma.probeRun.create({
    data: {
      customerId,
      provider: "SIMULATED",
      mode,
      questions: questions as any,
    },
  });

  let specificitySum = 0;
  let proofSum = 0;
  let coverageCount = 0;

  for (const q of questions) {
    const { answer, citations } = simulatedAnswerFor(q);
    const scored = scoreAnswer(answer, citations);
    specificitySum += scored.specificity;
    proofSum += scored.proof;
    coverageCount += 1;

    await prisma.probeAnswer.create({
      data: {
        probeRunId: probeRun.id,
        question: q,
        answer,
        citations: citations as any,
        hedging: scored.hedging,
        correctness: null,
      },
    });
  }

  const coverage = Math.round((coverageCount / Math.max(1, questions.length)) * 100);
  const specificity = Math.round(specificitySum / Math.max(1, questions.length));
  const proof = Math.round(proofSum / Math.max(1, questions.length));
  const freshness = 72; // demo: tied to claim freshness in later iteration
  const aiReadiness = Math.round((coverage + specificity + proof + freshness) / 4);
  const total = aiReadiness;

  const snapshot = await prisma.visibilityScoreSnapshot.create({
    data: {
      customerId,
      probeRunId: probeRun.id,
      total,
      coverage,
      specificity,
      proof,
      freshness,
      aiReadiness,
    },
  });

  return { probeRunId: probeRun.id, snapshotId: snapshot.id, snapshot };
}


