import { stableIdFromParts, type StoreContentKind } from "@/lib/store-demo/state";

export type TrustcartRecommendation = {
  id: string;
  kind: StoreContentKind;
  sourceId: string;
  sourceLabel: string;
  level: "ok" | "edit_required" | "new_required";
  title: string;
  suggested: string;
  receipt: string;
  tags?: string[];
};

function cleanText(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function summarize(answer: string, max = 260) {
  const a = cleanText(answer);
  if (!a) return "";
  const cut = a.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut).trim();
}

function productTagSuggestions(name: string) {
  const n = name.toLowerCase();
  const tags: string[] = ["All-day comfort", "City walking"];
  if (n.includes("sneaker")) tags.push("Travel", "Commute", "Weekend");
  if (n.includes("ballerina") || n.includes("flats") || n.includes("mary")) tags.push("Work", "Office", "Dinner");
  if (n.includes("loafer") || n.includes("derby")) tags.push("Workwear", "Smart casual");
  if (n.includes("boots")) tags.push("Rain-ready", "Winter travel");
  tags.push("Fit & sizing", "Shipping", "Returns");
  // de-dupe
  return Array.from(new Set(tags));
}

export function getProductRecommendations(input: { slug: string; name: string; sourceUrl: string }) {
  const tags = productTagSuggestions(input.name);

  const rec1: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "product", input.slug, "trust-block"),
    kind: "product",
    sourceId: input.slug,
    sourceLabel: input.name,
    level: "edit_required",
    title: "Publish: Occasions + Shipping & returns (trust-critical)",
    suggested:
      [
        "Occasions",
        "- Workdays / commute",
        "- Travel",
        "- Dinner / weddings (comfortable standing)",
        "",
        "Shipping & returns",
        "- Delivery: add your Singapore SLA (e.g., 2–4 business days) and express option if available",
        "- Returns: state return window + condition requirements clearly",
        "- Exchanges: include a “size exchange” path (common for first-time buyers)",
      ].join("\n"),
    receipt: input.sourceUrl,
    tags,
  };

  const rec2: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "product", input.slug, "occasions"),
    kind: "product",
    sourceId: input.slug,
    sourceLabel: input.name,
    level: "edit_required",
    title: "Publish: Fit & sizing (reduce exchange anxiety)",
    suggested: [
      "Fit & sizing",
      "- True to size for most customers",
      "- If between sizes: size up",
      "- If wide feet: choose styles with more toe room (or size up)",
      "- If standing all day: prioritize roomier toe box + structured insoles",
    ].join("\n"),
    receipt: input.sourceUrl,
  };

  const rec3: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "product", input.slug, "tags"),
    kind: "product",
    sourceId: input.slug,
    sourceLabel: input.name,
    level: "edit_required",
    title: "AI-discovery product tags (recommended)",
    suggested: `Suggested tags:\n- ${tags.join("\n- ")}\n\nWhy: tags help AI discovery + site search/filters map real customer intent to the right product.`,
    receipt: input.sourceUrl,
    tags,
  };

  return [rec1, rec2, rec3];
}

export function getBlogRecommendations(input: { slug: string; headline: string; description: string; sourceUrl: string }) {
  const rec1: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "blog", input.slug, "summary-cta"),
    kind: "blog",
    sourceId: input.slug,
    sourceLabel: input.headline,
    level: "edit_required",
    title: "Add an AI-discovery summary + conversion CTA",
    suggested:
      "Publish this at the top of the article:\n\n3-bullet summary\n- What you’ll learn\n- Who it’s for\n- The key takeaway\n\nConversion CTA\n- Link to the most relevant 2–3 products/collections\n- Add a ‘Shop the look’ section\n\nThis turns readers into buyers and improves AI discovery coverage.",
    receipt: input.sourceUrl,
  };

  const rec2: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "blog", input.slug, "3-bullets"),
    kind: "blog",
    sourceId: input.slug,
    sourceLabel: input.headline,
    level: "edit_required",
    title: `3-bullet customer-first summary: ${input.headline}`,
    suggested:
      `- What you’ll learn: ${summarize(input.description, 120) || "How to choose comfort without sacrificing style"}\n- Why it matters: less foot fatigue + more confidence in the purchase\n- What to do next: pick a shoe that matches your walking day + occasions`,
    receipt: input.sourceUrl,
  };

  return [rec1, rec2];
}

export function getFaqRecommendations(input: { id: string; question: string; answer: string; sourceUrl: string }) {
  const title = cleanText(input.question)
    .replace(/^what is this page about:\s*/i, "")
    .replace(/\?$/, "");

  const rec1: TrustcartRecommendation = {
    id: stableIdFromParts("tc", "faq", input.id, "rewrite"),
    kind: "faq",
    sourceId: input.id,
    sourceLabel: title,
    level: "edit_required",
    title: "Rewrite this policy into a customer-first FAQ",
    suggested:
      `Short answer:\n${summarize(input.answer) || "See policy for details."}\n\nRewrite structure:\n- Summary (1–2 lines)\n- Eligibility\n- Timeline\n- How to initiate\n- What happens next\n\nGoal: reduce purchase anxiety and remove ambiguity.`,
    receipt: input.sourceUrl,
  };

  return [rec1];
}

export function getNewContentRecommendations(domain: string) {
  const recs: TrustcartRecommendation[] = [
    {
      id: stableIdFromParts("tc", "faq", "new", "size-guide"),
      kind: "faq",
      sourceId: "new:faq:size-guide",
      sourceLabel: "New FAQ: Size & fit guide",
      level: "new_required",
      title: "Create a Size & Fit guide (FAQ)",
      suggested:
        "FAQ: How do I choose my size?\n\n- True to size for most\n- If between sizes: size up\n- If wide feet: prioritize toe-room styles\n- If standing all day: consider more toe room\n\nAdd 2–3 examples by product type (sneaker vs flats vs loafers).",
      receipt: `https://${domain}/pages/size-guide`,
    },
    {
      id: stableIdFromParts("tc", "blog", "new", "occasion-guide"),
      kind: "blog",
      sourceId: "new:blog:occasion-guide",
      sourceLabel: "New blog: What to wear to ___ (comfort edition)",
      level: "new_required",
      title: "Create an ‘Occasion’ guide blog (and link products)",
      suggested:
        "Blog outline:\n- Workday commute\n- Travel day\n- Dinner / event standing\n- Rainy day\n\nFor each:\n- 3 bullets on what matters\n- 2–3 product picks\n- One CTA: Shop the edit",
      receipt: `https://${domain}/blogs/communitystory/occasion-guide`,
    },
  ];

  return recs;
}

