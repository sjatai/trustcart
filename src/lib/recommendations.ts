import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain } from "@/lib/domain";

type RecAction = "CREATE" | "UPDATE" | "NO_OP" | "DEFER" | "SKIP";

function excerpt(s: string, max = 280) {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function stableHash32(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function stableSlug(prefix: string, seed: string) {
  const h = stableHash32(`${prefix}|${seed}`.toLowerCase());
  return `${prefix}-${h}`.toLowerCase();
}

async function latestProbeAnswers(customerId: string) {
  const latestRun = await prisma.probeRun.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { answers: true },
  });
  return latestRun ? { run: latestRun, answers: latestRun.answers } : null;
}

async function topQuestions(customerId: string, n = 40) {
  return prisma.question.findMany({
    where: { customerId },
    orderBy: [{ impactScore: "desc" }, { updatedAt: "desc" }],
    take: n,
    include: { gaps: true, needs: { include: { claim: { include: { evidence: true } } } } },
  });
}

function parseTags(tags?: string | null): string[] {
  return String(tags || "")
    .split(/,|;/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function productMissingSignals(product: { tags?: string | null; specs?: any; descriptionHtml?: string | null }) {
  const tags = parseTags(product.tags);
  const specs = (product.specs || {}) as any;
  const desc = String(product.descriptionHtml || "").trim();

  const missing: string[] = [];
  const need = (label: string, ok: boolean) => {
    if (!ok) missing.push(label);
  };

  // A minimal “trustworthy PDP” set for the SunnyStep demo.
  need("materials", Boolean(specs.materials || specs.material || tags.some((t) => /material/i.test(t)) || /material/i.test(desc)));
  need("fit/sizing guidance", Boolean(specs.fit || specs.sizing || /size|sizing|fit/i.test(desc)));
  need("care instructions", Boolean(specs.care || /care|wash|clean/i.test(desc)));
  need("returns snippet", Boolean(specs.returns || /return/i.test(desc)));
  need("shipping snippet (SG)", Boolean(specs.shipping || /ship|delivery/i.test(desc)));
  need("use-cases / occasions", Boolean(specs.bestFor || /best for|work|wedding|party|travel/i.test(desc)));

  return missing;
}

function classifyQuestionForEcommerce(questionText: string) {
  const q = (questionText || "").toLowerCase();

  // Obvious "wrong domain" filters (prevents the legacy auto-dealer bank from polluting ecommerce demos).
  const irrelevantTerms = ["nissan", "lease", "apr", "trade-in", "trade in", "test drive", "service appointment", "used car", "financing"];
  if (irrelevantTerms.some((t) => q.includes(t))) return { relevant: false as const, surface: "FAQ" as const, theme: "irrelevant" as const };

  const policyTerms = ["shipping", "delivery", "returns", "return", "exchange", "refund", "courier", "track", "payment", "apple pay", "google pay", "cod", "cash on delivery", "warranty"];
  if (policyTerms.some((t) => q.includes(t))) return { relevant: true as const, surface: "FAQ" as const, theme: "policy" as const };

  const productTerms = ["size", "sizing", "fit", "narrow", "wide", "materials", "material", "breathable", "water", "waterproof", "water-resistant", "care", "clean", "wash", "comfortable", "standing"];
  if (productTerms.some((t) => q.includes(t))) return { relevant: true as const, surface: "PRODUCT" as const, theme: "product_attributes" as const };

  const blogTerms = ["which", "best", "difference", "trending", "popular", "best-selling", "best selling", "smart-casual", "smart casual", "office", "work", "wedding", "party", "travel", "outfit"];
  if (blogTerms.some((t) => q.includes(t))) return { relevant: true as const, surface: "BLOG" as const, theme: "buying_guide" as const };

  return { relevant: true as const, surface: "FAQ" as const, theme: "general" as const };
}

function probeQuality(answer: { answer: string; hedging?: number | null } | null) {
  if (!answer) return { label: "none" as const, weak: false, unverifiable: false };
  const a = (answer.answer || "").trim();
  const hedging = Number(answer.hedging ?? 50);
  const unverifiable = /^not_verifiable\s*:/i.test(a) || a.includes("NOT_VERIFIABLE:");
  const weak = unverifiable || hedging >= 70;
  return { label: unverifiable ? ("unverifiable" as const) : weak ? ("weak" as const) : ("strong" as const), weak, unverifiable };
}

async function blogInventoryTopics(customerId: string) {
  // Prefer crawl inventory; fall back to already-published BLOG assets.
  const pages = await prisma.crawlPage.findMany({
    where: {
      crawlRun: { customerId },
      OR: [{ url: { contains: "/blog", mode: "insensitive" } as any }, { url: { contains: "/blogs", mode: "insensitive" } as any }],
    },
    orderBy: { fetchedAt: "desc" },
    take: 50,
    select: { url: true, title: true, text: true },
  });

  const assets = await prisma.asset.findMany({
    where: { customerId, type: "BLOG" as any, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] as any } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { title: true, slug: true },
  });

  const titles = [
    ...pages.map((p) => `${p.title || ""} ${p.url || ""} ${(p.text || "").slice(0, 180)}`.trim()),
    ...assets.map((a) => `${a.title || ""} ${a.slug || ""}`.trim()),
  ]
    .filter(Boolean)
    .map((t) => t.toLowerCase());

  const has = (re: RegExp) => titles.some((t) => re.test(t));

  return {
    shipping: has(/ship|delivery/),
    returns: has(/return|exchange|refund/),
    sizing: has(/size|sizing|fit/),
    occasions: has(/office|work|wedding|party|travel|occasion|outfit/),
    materials_care: has(/material|breathable|care|clean|wash/),
  };
}

export async function generateContentRecommendations(domain: string) {
  const customer = await getCustomerByDomain(domain);

  const probe = await latestProbeAnswers(customer.id);
  const questions = await topQuestions(customer.id, 60);
  const products = await prisma.product.findMany({ where: { customerId: customer.id }, orderBy: { updatedAt: "desc" }, take: 30 });
  const blogTopics = await blogInventoryTopics(customer.id);

  const probeByQuestion = new Map<string, { answer: string; hedging?: number | null }>();
  for (const a of probe?.answers || []) {
    probeByQuestion.set(a.question.trim().toLowerCase(), { answer: a.answer, hedging: a.hedging });
  }

  const recs: any[] = [];

  const pickProductFor = (qText: string, seed: string) => {
    // For demo: match by handle/title if present; otherwise spread picks deterministically across catalog.
    const lowered = qText.toLowerCase();
    const direct = products.find((p) => lowered.includes(p.handle.toLowerCase()) || lowered.includes(p.title.toLowerCase()));
    if (direct) return direct;
    if (!products.length) return null;
    const idx = parseInt(stableHash32(`${domain}|${seed}`), 16) % products.length;
    return products[idx] || products[0] || null;
  };

  // BLOG: only recommend missing high-impact themes (new posts). Never recommend “edits” unless factual correction (not in demo).
  const blogMissingThemes: Array<{ themeKey: string; title: string; driver: string }> = [];
  const addTheme = (themeKey: string, title: string, driver: string) => {
    if (blogMissingThemes.some((t) => t.themeKey === themeKey)) return;
    blogMissingThemes.push({ themeKey, title, driver });
  };

  // Identify high-impact demand themes from questions.
  for (const q of questions.slice(0, 25)) {
    if ((q.impactScore || 0) < 70) continue;
    const qt = q.text.toLowerCase();
    if (/ship|deliver|courier|track/.test(qt) && !blogTopics.shipping) addTheme("shipping", "Shipping & delivery in Singapore (what to expect)", q.text);
    if (/return|exchange|refund/.test(qt) && !blogTopics.returns) addTheme("returns", "Returns & exchanges (simple, buyer-first guide)", q.text);
    if (/size|sizing|fit|wide|narrow/.test(qt) && !blogTopics.sizing) addTheme("sizing", "Sizing & fit guide (Singapore buyers)", q.text);
    if (/office|work|wedding|party|travel|outfit|occasion/.test(qt) && !blogTopics.occasions) addTheme("occasions", "Occasion guide: what to wear (comfort-first)", q.text);
    if (/material|breathable|care|clean|wash|water/.test(qt) && !blogTopics.materials_care) addTheme("materials_care", "Materials + care guide (breathability, cleaning, longevity)", q.text);
  }

  for (const t of blogMissingThemes.slice(0, 5)) {
    const slug = stableSlug("blog", `${domain}|${t.themeKey}`);
    recs.push({
      customerId: customer.id,
      kind: "CREATE",
      publishTarget: "BLOG",
      title: `Create blog: ${t.title}`,
      why: `Missing high-impact blog theme driven by demand signals: “${excerpt(t.driver, 70)}”.`,
      targetUrl: "/site/blog",
      suggestedContent: "",
      questionId: null,
      questionText: t.driver,
      recommendedAssetType: "BLOG",
      llmEvidence: {
        action: "CREATE" as RecAction,
        stableSlug: slug,
        evidence: {
          siteCoverage: { covered: false, snippets: [] },
          llmAnswerQuality: "none",
        },
        note: "New blog only (no rewrites). Draft must stay grounded in verified claims/evidence.",
      },
    });
  }

  for (const q of questions) {
    const qText = String(q.text || "").trim();
    if (!qText) continue;

    const cls = classifyQuestionForEcommerce(qText);
    const impact = Number(q.impactScore ?? 0);
    const actionByImpact: RecAction = impact < 55 ? "DEFER" : "CREATE";

    const p = pickProductFor(qText, String(q.id || qText));
    const needs = (q.needs || []).filter((n: any) => n.required);
    const missingClaimKeys = needs.filter((n: any) => !n.claimId).map((n: any) => n.claimKey);
    const missingProofKeys = needs
      .filter((n: any) => n.claimId && ((n.claim?.evidence || []).length < 1))
      .map((n: any) => n.claimKey);

    const bestEvidence = needs
      .flatMap((n: any) => (n.claim?.evidence || []).map((e: any) => ({ url: e.url, excerpt: excerpt(e.snippet || "") })))
      .slice(0, 3);

    const probeAns = probeByQuestion.get(qText.toLowerCase()) || null;
    const pq = probeQuality(probeAns);

    const siteCovered = missingClaimKeys.length === 0 && missingProofKeys.length === 0;

    let action: RecAction = actionByImpact;
    if (!cls.relevant) action = "SKIP";
    else if (impact < 55) action = "DEFER";
    else if (siteCovered && pq.label === "strong" && String(q.state) === "ANSWERED") action = "NO_OP";
    else action = "CREATE";

    // Surface routing
    const surface = cls.surface;
    const publishTarget = surface === "PRODUCT" ? "PRODUCT" : surface === "BLOG" ? "BLOG" : "FAQ";

    // If blog topics are already covered, no-op blog recs rather than creating noise.
    if (publishTarget === "BLOG" && blogMissingThemes.length === 0) {
      action = action === "CREATE" ? "NO_OP" : action;
    }

    // PRODUCT: only recommend if we have products and missing attributes
    let productHandle: string | null = null;
    let productTitle: string | null = null;
    let productMissing: string[] = [];
    if (publishTarget === "PRODUCT") {
      if (!p) {
        action = "DEFER";
      } else {
        productHandle = p.handle;
        productTitle = p.title;
        productMissing = productMissingSignals(p);
        if (productMissing.length === 0 && pq.label !== "weak" && pq.label !== "unverifiable") {
          action = "NO_OP";
        }
      }
    }

    // Determine create vs update based on existing live asset presence (idempotent publishing).
    let effectiveKind = publishTarget === "PRODUCT" ? "PRODUCT_UPDATE" : "CREATE";
    if (action === "NO_OP" || action === "DEFER" || action === "SKIP") {
      // Keep kind stable but UI will disable publish.
      effectiveKind = publishTarget === "PRODUCT" ? "PRODUCT_UPDATE" : "CREATE";
    }

    // Stable slug for idempotent assets (FAQ/BLOG). Product uses product handle.
    const stable = publishTarget === "PRODUCT" ? (productHandle || "") : stableSlug(publishTarget.toLowerCase(), `${domain}|${q.id || qText}`);

    recs.push({
      customerId: customer.id,
      kind: effectiveKind,
      publishTarget,
      title:
        action === "NO_OP"
          ? `No change needed: ${excerpt(qText, 60)}`
          : action === "DEFER"
            ? `Defer: ${excerpt(qText, 60)}`
            : action === "SKIP"
              ? `Skip: ${excerpt(qText, 60)}`
              : publishTarget === "PRODUCT" && productTitle
                ? `Enrich product: ${productTitle}`
                : publishTarget === "BLOG"
                  ? `Blog (topic check): ${excerpt(qText, 60)}`
                  : `FAQ: ${excerpt(qText, 60)}`,
      why:
        action === "NO_OP"
          ? "Covered well on-site; no meaningful delta."
          : action === "DEFER"
            ? "Lower impact for demo; defer until higher-impact gaps are fixed."
            : action === "SKIP"
              ? "Not relevant to this brand/domain."
              : publishTarget === "PRODUCT"
                ? productMissing.length
                  ? `Missing product attributes: ${productMissing.slice(0, 4).join(", ")}.`
                  : "Product needs a small verified enrichment block (only missing deltas)."
                : publishTarget === "BLOG"
                  ? "Only create a new blog if a high-impact theme is missing from inventory."
                  : missingClaimKeys.length
                    ? `Missing site facts: ${missingClaimKeys.slice(0, 3).join(", ")}.`
                    : pq.label !== "strong"
                      ? `LLM answer quality is ${pq.label}; needs a verified canonical answer.`
                      : "Create a canonical, verified answer for this demand signal.",
      targetUrl: publishTarget === "PRODUCT" && productHandle ? `/site/products/${productHandle}` : publishTarget === "BLOG" ? "/site/blog" : "/site/faq",
      suggestedContent: "",
      claimKey: missingClaimKeys[0] || null,
      questionId: q.id,
      questionText: qText,
      recommendedAssetType: publishTarget === "BLOG" ? "BLOG" : publishTarget === "PRODUCT" ? "TRUTH_BLOCK" : "FAQ",
      productHandle,
      productTitle,
      llmEvidence: {
        action,
        stableSlug: stable || null,
        source: { questionId: q.id, questionText: qText, taxonomy: q.taxonomy, impactScore: impact },
        evidence: {
          siteCoverage: { covered: siteCovered, snippets: bestEvidence },
          llmAnswerQuality: pq.label,
          llmAnswerExcerpt: probeAns ? excerpt(probeAns.answer, 280) : "",
          missingClaimKeys,
          missingProofKeys,
        },
        notes:
          publishTarget === "PRODUCT" && productMissing.length === 0
            ? "Product appears sufficiently covered; recommend no-op unless probe shows weak/unverifiable."
            : null,
      },
    });
  }

  // Persist deterministically: ensure we always include product recs for the demo.
  // Target mix: 3 PRODUCT, 2 BLOG, 7 FAQ (total 12).
  const priority = (r: any) => {
    const a = String(r.llmEvidence?.action || "");
    if (a === "CREATE" || a === "UPDATE") return 0;
    if (a === "NO_OP") return 1;
    if (a === "DEFER") return 2;
    return 3; // SKIP
  };
  recs.sort((a, b) => priority(a) - priority(b));

  const created: any[] = [];
  const takeByTarget = (target: "PRODUCT" | "BLOG" | "FAQ", n: number) =>
    recs.filter((r) => r.publishTarget === target && String(r.llmEvidence?.action || "") === "CREATE").slice(0, n);

  const selected = [
    ...takeByTarget("PRODUCT", 3),
    ...takeByTarget("BLOG", 2),
    ...takeByTarget("FAQ", 7),
  ].slice(0, 12);

  for (const r of selected) {
    const existing = await prisma.contentRecommendation.findFirst({
      where: {
        customerId: customer.id,
        questionId: r.questionId,
        publishTarget: r.publishTarget as any,
        productHandle: r.productHandle ?? null,
        status: { in: ["PROPOSED", "DRAFTED", "APPROVED"] as any },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) {
      created.push(
        await prisma.contentRecommendation.update({
          where: { id: existing.id },
          data: {
            title: r.title,
            why: r.why,
            targetUrl: r.targetUrl,
            suggestedContent: r.suggestedContent,
            claimKey: r.claimKey,
            recommendedAssetType: r.recommendedAssetType as any,
            llmEvidence: r.llmEvidence as any,
            questionText: r.questionText,
            kind: r.kind as any,
            productTitle: r.productTitle,
          },
        }),
      );
    } else {
      created.push(
        await prisma.contentRecommendation.create({
          data: {
            customerId: r.customerId,
            kind: r.kind as any,
            status: "PROPOSED" as any,
            title: r.title,
            why: r.why,
            targetUrl: r.targetUrl,
            suggestedContent: r.suggestedContent,
            claimKey: r.claimKey,
            questionId: r.questionId,
            recommendedAssetType: r.recommendedAssetType as any,
            llmEvidence: r.llmEvidence as any,
            questionText: r.questionText,
            publishTarget: r.publishTarget as any,
            productHandle: r.productHandle,
            productTitle: r.productTitle,
          },
        }),
      );
    }
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "DECIDE",
    actor: "ORCHESTRATOR",
    summary: `Generated ${created.length} content recommendations.`,
    input: { domain },
    output: { recommendationIds: created.map((c) => c.id), count: created.length },
  });

  return created;
}