import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getCustomerByDomain } from "@/lib/domain";

type RecAction = "CREATE" | "UPDATE" | "NO_OP" | "DEFER" | "SKIP";

const DEMO_SUNNY_BLOG_TITLE = "Comfort science for walking + running: reduce fatigue, recover better";
const DEMO_SUNNY_BLOG_REC_TITLE = `Create blog: ${DEMO_SUNNY_BLOG_TITLE}`;

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

function normalizeText(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function faqTopicFromQuestion(questionText: string) {
  const q = normalizeText(questionText);
  if (/ship|shipping|deliver|delivery|courier|track/.test(q)) return "shipping";
  if (/return|returns|exchange|refund/.test(q)) return "returns";
  if (/size|sizing|fit|wide|narrow/.test(q)) return "sizing";
  if (/clean|wash|care|maintain|maintenance/.test(q)) return "care";
  if (/store|location|address|open|hours|hour|visit|try on/.test(q)) return "stores";
  if (/payment|pay|card|apple pay|google pay|grabpay|paynow/.test(q)) return "payment";
  return "general";
}

async function faqInventoryTopics(customerId: string) {
  const assets = await prisma.asset.findMany({
    where: { customerId, type: "FAQ" as any, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] as any } },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: { title: true, slug: true },
  });
  const titles = assets.map((a) => normalizeText(`${a.title || ""} ${a.slug || ""}`)).filter(Boolean);
  const has = (re: RegExp) => titles.some((t) => re.test(t));
  return {
    titles,
    shipping: has(/ship|shipping|deliver|delivery|courier|track/),
    returns: has(/return|returns|exchange|refund/),
    sizing: has(/size|sizing|fit|wide|narrow/),
    care: has(/clean|wash|care|maintain/),
    stores: has(/store|location|address|hours|open/),
    payment: has(/payment|pay|card|apple|google|paynow|grabpay/),
  };
}

export async function generateContentRecommendations(domain: string, opts?: { includeDemoBlog?: boolean }) {
  const customer = await getCustomerByDomain(domain);

  const probe = await latestProbeAnswers(customer.id);
  const questions = await topQuestions(customer.id, 60);
  const products = await prisma.product.findMany({ where: { customerId: customer.id }, orderBy: { updatedAt: "desc" }, take: 30 });
  const blogTopics = await blogInventoryTopics(customer.id);
  const faqTopics = await faqInventoryTopics(customer.id);

  const probeByQuestion = new Map<string, { answer: string; hedging?: number | null }>();
  for (const a of probe?.answers || []) {
    probeByQuestion.set(a.question.trim().toLowerCase(), { answer: a.answer, hedging: a.hedging });
  }

  const recs: any[] = [];

  // Sunnystep demo: keep the DB clean and deterministic (no extra blog topics).
  // Preserve the single curated lifestyle blog rec, remove other non-published blog recs.
  if (domain === "sunnystep.com") {
    await prisma.contentRecommendation.deleteMany({
      where: {
        customerId: customer.id,
        publishTarget: "BLOG" as any,
        status: { in: ["PROPOSED", "DRAFTED", "APPROVED"] as any },
        title: { not: DEMO_SUNNY_BLOG_REC_TITLE },
      },
    });
  }

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

  if (domain === "sunnystep.com") {
    // Sunnystep demo: ONLY surface the curated blog recommendation when explicitly requested
    // (i.e. after the presenter clicks Recommend). Otherwise keep it hidden from UI.
    blogMissingThemes.splice(0, blogMissingThemes.length);
    if (opts?.includeDemoBlog) {
      const driver =
        questions.find((q) => /walk|walking|running|exercise|standing|fatigue|comfort|recovery|support/i.test(String(q.text || "")))?.text ||
        "How do supportive shoes reduce fatigue during walking, running, and standing?";
      blogMissingThemes.push({ themeKey: "demo_lifestyle", title: DEMO_SUNNY_BLOG_TITLE, driver: String(driver) });
    }
  } else if (blogMissingThemes.length === 0) {
    // Identify high-impact demand themes from questions (non-sunnystep domains only).
    for (const q of questions.slice(0, 25)) {
      if ((q.impactScore || 0) < 70) continue;
      const qt = q.text.toLowerCase();
      if (/ship|deliver|courier|track/.test(qt) && !blogTopics.shipping) addTheme("shipping", "Shipping & delivery in Singapore (what to expect)", q.text);
      if (/return|exchange|refund/.test(qt) && !blogTopics.returns) addTheme("returns", "Returns & exchanges (simple, buyer-first guide)", q.text);
      if (/size|sizing|fit|wide|narrow/.test(qt) && !blogTopics.sizing) addTheme("sizing", "Sizing & fit guide (Singapore buyers)", q.text);
      if (/office|work|wedding|party|travel|outfit|occasion/.test(qt) && !blogTopics.occasions) addTheme("occasions", "Occasion guide: what to wear (comfort-first)", q.text);
      if (/material|breathable|care|clean|wash|water/.test(qt) && !blogTopics.materials_care) addTheme("materials_care", "Materials + care guide (breathability, cleaning, longevity)", q.text);
    }

    // Other domains: if nothing is missing, still provide one blog rec for the demo flow.
    const driver = questions.find((q) => /walk|walking|standing|comfort|fit/i.test(String(q.text || "")))?.text || "How to choose shoes that reduce fatigue?";
    addTheme("demo_lifestyle", "Comfort science for walking: reduce fatigue, recover better", String(driver));
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
      // Use a deterministic synthetic id so repeated runs update the same recommendation (no duplication).
      questionId: stableSlug("demo", `${domain}|blog|${t.themeKey}`),
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

  // Sunnystep demo: recommend at least 2 FAQ answers that are grounded in claims we already extracted,
  // but may not be clearly stated as canonical FAQs.
  if (domain === "sunnystep.com") {
    const needKeys = ["store.sg.locations", "store.sg.hours", "size.guide.conversion", "product.fit.true_to_size", "product.care.cleaning"];
    const claims = await prisma.claim.findMany({
      where: { customerId: customer.id, key: { in: needKeys } },
      include: { evidence: { take: 2, orderBy: { capturedAt: "desc" } } as any },
    });
    const byKey = new Map(claims.map((c: any) => [c.key, c]));

    const mkEvidence = (keys: string[]) =>
      keys
        .flatMap((k) => (byKey.get(k)?.evidence || []).map((e: any) => ({ url: e.url, excerpt: excerpt(e.snippet || "", 220) })))
        .slice(0, 3);

    const demoFaqs = [
      {
        idSeed: "demo_faq_store_hours",
        title: "FAQ: Where are your stores in Singapore, and what are the opening hours?",
        questionText: "Where can I try SunnyStep shoes in Singapore, and what time are stores open?",
        claimKey: "store.sg.locations",
        evidence: mkEvidence(["store.sg.locations", "store.sg.hours"]),
        stableSlug: "faq-stores-singapore-hours",
        shortAnswer: "Find SunnyStep stores in Singapore and check store-specific opening hours via the store locator.",
        bodyMarkdown: [
          "# FAQ: Where are your stores in Singapore, and what are the opening hours?",
          "",
          "SunnyStep has physical stores in Singapore where you can try on shoes in person.",
          "",
          "## Where to find store locations",
          "- Use the store locator to view current locations and details.",
          "",
          "## Opening hours",
          "- Opening hours vary by location. Check the store locator for the latest hours for each store.",
          "",
          "Source: https://www.sunnystep.com/pages/frequently-asked-questions",
        ].join("\n"),
      },
      {
        idSeed: "demo_faq_size_guide",
        title: "FAQ: How do I choose my size? (fit + size conversion)",
        questionText: "How do I choose the right size (true-to-size + US/EU/UK conversion)?",
        claimKey: "size.guide.conversion",
        evidence: mkEvidence(["product.fit.true_to_size", "size.guide.conversion"]),
        stableSlug: "faq-size-guide-conversion",
        shortAnswer: "Use the size guide; fit may vary by style. Follow the brand’s fit notes and size conversion guidance where provided.",
        bodyMarkdown: [
          "# FAQ: How do I choose my size? (fit + size conversion)",
          "",
          "We recommend checking the size guide for the best fit, as sizing may vary between styles.",
          "",
          "## Fit notes",
          "- Most styles follow the size guide; if you are between sizes, follow the guide’s recommendation.",
          "- Note: for the Balance Space Runner, consider sizing up by two sizes (per the brand’s guidance).",
          "",
          "## Size conversion",
          "- Refer to the size guide on the site for any available US/EU/UK conversion guidance.",
          "",
          "Source: https://www.sunnystep.com/pages/frequently-asked-questions",
        ].join("\n"),
      },
    ];

    for (const d of demoFaqs) {
      recs.push({
        customerId: customer.id,
        kind: "CREATE",
        status: "DRAFTED",
        publishTarget: "FAQ",
        title: d.title,
        why: "We found the underlying facts in discovery, but shoppers need a single clear FAQ answer.",
        targetUrl: "/site/faq",
        suggestedContent: String(d.bodyMarkdown || "").trim() ? String(d.bodyMarkdown).trim() + "\n" : "",
        claimKey: d.claimKey,
        questionId: stableSlug("demo", `${domain}|${d.idSeed}`),
        questionText: d.questionText,
        recommendedAssetType: "FAQ",
        llmEvidence: {
          action: "CREATE" as RecAction,
          stableSlug: d.stableSlug,
          draft: {
            type: "FAQ",
            title: d.title,
            slug: d.stableSlug,
            targetUrl: "/site/faq",
            content: {
              shortAnswer: d.shortAnswer,
              bodyMarkdown: String(d.bodyMarkdown || "").trim() ? String(d.bodyMarkdown).trim() + "\n" : "",
              factsUsed: [],
              needsVerification: [],
              llmEvidence: [{ provider: "SIMULATED", quote: "Prefilled from seeded site facts (no OpenAI required)." }],
            },
          },
          evidence: {
            siteCoverage: { covered: true, snippets: d.evidence },
            llmAnswerQuality: "none",
            missingClaimKeys: [],
            missingProofKeys: [],
          },
          flags: { faqMissingOnPage: true, demoPinned: true },
        },
      });
    }
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

    // Sunnystep demo: keep blog recommendations to the single curated lifestyle post only.
    if (domain === "sunnystep.com" && publishTarget === "BLOG") {
      action = "SKIP";
    }

    // If blog topics are already covered, no-op blog recs rather than creating noise.
    if (publishTarget === "BLOG" && blogMissingThemes.length === 0) {
      action = action === "CREATE" ? "NO_OP" : action;
    }

    // FAQ: recommend at least a couple of "missing on FAQ page" items for the demo.
    // Even if we have the facts (claims/evidence), if the FAQ inventory doesn't cover the topic,
    // create a canonical FAQ so discovery becomes visible to shoppers.
    let faqMissingOnPage = false;
    const faqSeemsCovered = (question: string) => {
      const qn = normalizeText(question);
      const tokens = qn
        .split(" ")
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !["what", "when", "where", "which", "with", "your", "does", "have", "from", "this", "that"].includes(t));
      if (tokens.length < 2) return true;
      for (const t of faqTopics.titles || []) {
        let hits = 0;
        for (const tok of tokens) if (t.includes(tok)) hits++;
        if (hits >= 2) return true;
      }
      return false;
    };

    if (publishTarget === "FAQ" && action !== "SKIP" && impact >= 55) {
      const topic = faqTopicFromQuestion(qText);
      const coveredByFaq =
        topic === "shipping"
          ? faqTopics.shipping
          : topic === "returns"
            ? faqTopics.returns
            : topic === "sizing"
              ? faqTopics.sizing
              : topic === "care"
                ? faqTopics.care
                : topic === "stores"
                  ? faqTopics.stores
                  : topic === "payment"
                    ? faqTopics.payment
                    : faqSeemsCovered(qText);
      faqMissingOnPage = !(coveredByFaq || faqSeemsCovered(qText));
      // Only label as "missing on FAQ page" if we can ground it in existing discovery/claims.
      if (!siteCovered) faqMissingOnPage = false;
      if (faqMissingOnPage) {
        action = "CREATE";
      }
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
                  : faqMissingOnPage
                    ? "We have the facts in discovery, but the FAQ page doesn’t answer this clearly yet."
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
        flags: { faqMissingOnPage },
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
  const takeByTarget = (target: "PRODUCT" | "BLOG" | "FAQ", n: number) => {
    const pool = recs.filter((r) => r.publishTarget === target && String(r.llmEvidence?.action || "") === "CREATE");
    if (target !== "FAQ") return pool.slice(0, n);
    // Prefer at least 2 FAQ items that are explicitly "missing on FAQ page".
    const missingOnFaq = pool.filter((r) => r.llmEvidence?.flags?.faqMissingOnPage).slice(0, 2);
    const rest = pool.filter((r) => !r.llmEvidence?.flags?.faqMissingOnPage);
    return [...missingOnFaq, ...rest].slice(0, n);
  };

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
      const data: any = {
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
      };
      if (r.status) data.status = r.status as any;
      created.push(await prisma.contentRecommendation.update({ where: { id: existing.id }, data }));
    } else {
      created.push(
        await prisma.contentRecommendation.create({
          data: {
            customerId: r.customerId,
            kind: r.kind as any,
            status: (r.status || "PROPOSED") as any,
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

  // Keep the active set deterministic and demo-friendly:
  // prune old PROPOSED recommendations not part of the current selected set (keeps any drafted/approved work).
  const keepIds = new Set(created.map((c) => c.id));
  await prisma.contentRecommendation.deleteMany({
    where: {
      customerId: customer.id,
      status: "PROPOSED" as any,
      id: { notIn: Array.from(keepIds) },
    },
  });

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