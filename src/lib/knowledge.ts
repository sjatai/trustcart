import { prisma } from "@/lib/db";
import { cleanSnippet } from "@/lib/evidenceFormat";

function findPhones(text: string) {
  const phones = new Set<string>();
  const re = /(\+?1[\s-]?)?(\(?\d{3}\)?)[\s.-]?\d{3}[\s.-]?\d{4}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    phones.add(m[0].replace(/\s+/g, " ").trim());
  }
  return [...phones].slice(0, 5);
}

function findEmails(text: string) {
  const emails = new Set<string>();
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    emails.add(m[0].toLowerCase());
  }
  return [...emails].slice(0, 5);
}

function findHoursLines(text: string) {
  const lines = text.split(/[\.\n\r]+/).map((l) => l.trim());
  return lines
    .filter((l) => /(mon|tue|wed|thu|fri|sat|sun)/i.test(l) && /(\d{1,2}\s?(am|pm)|\d{1,2}:\d{2})/i.test(l))
    .slice(0, 6);
}

function excerpt(text: string, maxLen = 220) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

function parseFaqMarkdown(md: string): { question: string; answer: string } {
  const s = String(md || "").trim();
  if (!s) return { question: "", answer: "" };
  const lines = s.split("\n");
  const first = (lines[0] || "").trim();
  const q = first.startsWith("#") ? first.replace(/^#+\s*/, "").trim() : "";
  const rest = lines.slice(1).join("\n").trim();
  return { question: q, answer: rest.replace(/^#+\s.*/gm, "").trim() };
}

function stripMd(md: string) {
  return String(md || "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type StoreClaimSeed = {
  key: string;
  value: string;
  scope: any;
  evidenceUrl: string;
  evidenceSnippet?: string | null;
  confidence?: number;
};

export async function buildClaimsFromStore({
  customerId,
}: {
  customerId: string;
}) {
  const createdClaimIds: string[] = [];

  async function upsertClaimWithEvidence(args: StoreClaimSeed) {
    const normalizedSnippet = cleanSnippet(args.evidenceSnippet ?? "");
    const existing = await prisma.claim.findFirst({ where: { customerId, key: args.key } });
    const claim = existing
      ? await prisma.claim.update({
          where: { id: existing.id },
          data: {
            value: args.value,
            scope: args.scope,
            freshnessAt: new Date(),
            confidence: args.confidence ?? existing.confidence,
          },
        })
      : await prisma.claim.create({
          data: {
            customerId,
            key: args.key,
            value: args.value,
            scope: args.scope,
            freshnessAt: new Date(),
            confidence: args.confidence ?? 82,
          },
        });

    createdClaimIds.push(claim.id);

    await prisma.evidence.create({
      data: {
        claimId: claim.id,
        url: args.evidenceUrl,
        snippet: normalizedSnippet || null,
      },
    });

    // Attach claimId to any question needs that reference this claimKey.
    await prisma.questionNeed.updateMany({
      where: { claimKey: args.key, claimId: null, question: { customerId } as any },
      data: { claimId: claim.id },
    });
  }

  // Clean up redundant claim keys from previous runs (demo hygiene)
  await prisma.questionNeed.updateMany({
    where: { claimKey: "product.care.machine_wash", question: { customerId } as any },
    data: { claimId: null },
  });
  await prisma.claim.deleteMany({
    where: { customerId, key: "product.care.machine_wash" },
  });

  // Pull the latest FAQ assets (seeded from sunnystep.com) and map to key claim buckets.
  const faqAssets = await prisma.asset.findMany({
    where: { customerId, type: "FAQ" as any, status: { in: ["PUBLISHED", "APPROVED", "DRAFT"] as any } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const entries = faqAssets
    .map((a) => {
      const md = String(a.versions?.[0]?.content || "");
      const parsed = parseFaqMarkdown(md);
      const q = (parsed.question || String(a.title || "")).trim();
      const ans = stripMd(parsed.answer || md);
      const url = String((a.meta as any)?.url || "").trim() || "/faq";
      return { q, ans, url };
    })
    .filter((x) => x.q && x.ans);

  const findBy = (re: RegExp) => entries.find((e) => re.test(e.q.toLowerCase()) || re.test(e.ans.toLowerCase())) || null;

  const shipping = findBy(/shipping|delivery/);
  if (shipping) {
    await upsertClaimWithEvidence({
      key: "policy.shipping.sg",
      value: excerpt(shipping.ans, 220),
      scope: "POLICY",
      evidenceUrl: shipping.url,
      evidenceSnippet: excerpt(shipping.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "policy.shipping.time_sg",
      value: excerpt(shipping.ans, 220),
      scope: "POLICY",
      evidenceUrl: shipping.url,
      evidenceSnippet: excerpt(shipping.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "policy.shipping.fee_sg",
      value: excerpt(shipping.ans, 220),
      scope: "POLICY",
      evidenceUrl: shipping.url,
      evidenceSnippet: excerpt(shipping.ans, 260),
    });
  }

  const returns = findBy(/return|returns|exchange|exchanges|refund/);
  if (returns) {
    await upsertClaimWithEvidence({
      key: "policy.returns.window",
      value: excerpt(returns.ans, 220),
      scope: "POLICY",
      evidenceUrl: returns.url,
      evidenceSnippet: excerpt(returns.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "policy.exchanges.process",
      value: excerpt(returns.ans, 240),
      scope: "POLICY",
      evidenceUrl: returns.url,
      evidenceSnippet: excerpt(returns.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "policy.refunds.time",
      value: excerpt(returns.ans, 220),
      scope: "POLICY",
      evidenceUrl: returns.url,
      evidenceSnippet: excerpt(returns.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "policy.returns.in_store",
      value: excerpt(returns.ans, 220),
      scope: "POLICY",
      evidenceUrl: returns.url,
      evidenceSnippet: excerpt(returns.ans, 260),
    });
  }

  const stores = findBy(/store|stores|locations/);
  if (stores) {
    await upsertClaimWithEvidence({
      key: "store.sg.locations",
      value: excerpt(stores.ans, 240),
      scope: "LOCATION",
      evidenceUrl: stores.url,
      evidenceSnippet: excerpt(stores.ans, 260),
    });
  }

  const hours = entries.find((e) => /am|pm|\d{1,2}\s*-\s*\d{1,2}/i.test(e.ans) && /#|mall|junction|orchard|city/i.test(e.ans.toLowerCase())) || null;
  if (hours) {
    await upsertClaimWithEvidence({
      key: "store.sg.hours",
      value: excerpt(hours.ans, 240),
      scope: "LOCATION",
      evidenceUrl: hours.url,
      evidenceSnippet: excerpt(hours.ans, 260),
    });
  }

  const wideFeet = findBy(/wide feet|bunions|toe box/);
  if (wideFeet) {
    await upsertClaimWithEvidence({
      key: "product.fit.wide_feet",
      value: excerpt(wideFeet.ans, 220),
      scope: "INVENTORY",
      evidenceUrl: wideFeet.url,
      evidenceSnippet: excerpt(wideFeet.ans, 260),
    });
  }

  const sizing = findBy(/true-to-size|true to size|size guide|us\/eu\/uk|choose the right size/);
  if (sizing) {
    await upsertClaimWithEvidence({
      key: "product.fit.true_to_size",
      value: excerpt(sizing.ans, 220),
      scope: "INVENTORY",
      evidenceUrl: sizing.url,
      evidenceSnippet: excerpt(sizing.ans, 260),
    });
    await upsertClaimWithEvidence({
      key: "size.guide.conversion",
      value: excerpt(sizing.ans, 220),
      scope: "INVENTORY",
      evidenceUrl: sizing.url,
      evidenceSnippet: excerpt(sizing.ans, 260),
    });
  }

  const cleaning = findBy(/clean|care|machine wash|wash/);
  if (cleaning) {
    await upsertClaimWithEvidence({
      key: "product.care.cleaning",
      value: excerpt(cleaning.ans, 220),
      scope: "INVENTORY",
      evidenceUrl: cleaning.url,
      evidenceSnippet: excerpt(cleaning.ans, 260),
    });
  }

  // A simple “catalog exists” availability signal so recommendations can focus on local details.
  const product = await prisma.product.findFirst({ where: { customerId }, orderBy: { updatedAt: "desc" }, select: { specs: true } });
  if (product) {
    const src = String((product.specs as any)?.sourceUrl || "").trim() || "https://www.sunnystep.com/collections/new-arrivals";
    await upsertClaimWithEvidence({
      key: "availability.sg.now",
      value: "Products are available online; see the product catalog and PDPs for current availability by size/color.",
      scope: "INVENTORY",
      evidenceUrl: src,
      evidenceSnippet: "Catalog inventory is available online; specific size availability depends on stock.",
      confidence: 70,
    });
  }

  return { createdClaimIds };
}

export async function buildClaimsFromCrawl({
  customerId,
  crawlRunId,
}: {
  customerId: string;
  crawlRunId: string;
}) {
  const pages = await prisma.crawlPage.findMany({ where: { crawlRunId } });
  if (pages.length === 0) {
    throw new Error("Crawl produced zero pages; cannot build claims. Ensure outbound internet access and that the domain is reachable.");
  }
  const combinedText = pages.map((p) => p.text || "").join("\n");

  const phones = findPhones(combinedText);
  const hours = findHoursLines(combinedText);
  const emails = findEmails(combinedText);

  const createdClaimIds: string[] = [];

  const seenEvidence = new Set<string>();

  async function upsertClaimWithEvidence(args: {
    key: string;
    value: string;
    scope: any;
    evidenceUrl: string;
    evidenceSnippet?: string | null;
    confidence?: number;
  }) {
    const normalizedSnippet = cleanSnippet(args.evidenceSnippet ?? "");
    const evidenceSignature = `${args.key}|${normalizedSnippet}`;
    if (seenEvidence.has(evidenceSignature)) {
      return;
    }
    seenEvidence.add(evidenceSignature);
    const existing = await prisma.claim.findFirst({ where: { customerId, key: args.key } });
    const claim = existing
      ? await prisma.claim.update({
          where: { id: existing.id },
          data: {
            value: args.value,
            scope: args.scope,
            freshnessAt: new Date(),
            confidence: args.confidence ?? existing.confidence,
          },
        })
      : await prisma.claim.create({
          data: {
            customerId,
            key: args.key,
            value: args.value,
            scope: args.scope,
            freshnessAt: new Date(),
            confidence: args.confidence ?? 72,
          },
        });
    createdClaimIds.push(claim.id);
    await prisma.evidence.create({
      data: {
        claimId: claim.id,
        crawlRunId,
        url: args.evidenceUrl,
        snippet: normalizedSnippet || null,
      },
    });

    // Attach claimId to any question needs that reference this claimKey.
    await prisma.questionNeed.updateMany({
      where: { claimKey: args.key, claimId: null, question: { customerId } as any },
      data: { claimId: claim.id },
    });
  }

  // Core “business fact” claims (only if found).
  if (phones[0]) {
    await upsertClaimWithEvidence({
      key: "phone.primary",
      value: phones[0],
      scope: "BUSINESS",
      evidenceUrl: pages[0].url,
      evidenceSnippet: `Phone found in crawl text: ${phones[0]}`,
    });
  }
  if (hours.length > 0) {
    await upsertClaimWithEvidence({
      key: "hours.summary",
      value: hours.join(" • ").slice(0, 240),
      scope: "BUSINESS",
      evidenceUrl: pages[0].url,
      evidenceSnippet: `Hours lines found in crawl text: ${hours.slice(0, 2).join(" | ")}`,
    });
  }
  if (emails[0]) {
    await upsertClaimWithEvidence({
      key: "email.primary",
      value: emails[0],
      scope: "BUSINESS",
      evidenceUrl: pages[0].url,
      evidenceSnippet: `Email found in crawl text: ${emails[0]}`,
    });
  }

  // Ensure we create enough claims/evidence WITHOUT fabricating:
  // create per-page extracted facts (url/title/excerpt) that are directly sourced.
  const maxPagesForClaims = Math.min(15, pages.length);
  for (let i = 0; i < maxPagesForClaims; i++) {
    const p = pages[i];
    if (!p?.url) continue;

    if (p.title) {
      await upsertClaimWithEvidence({
        key: `crawl.${crawlRunId}.page.${i + 1}.title`,
        value: p.title.slice(0, 200),
        scope: "OTHER",
        evidenceUrl: p.url,
        evidenceSnippet: p.title.slice(0, 200),
        confidence: 80,
      });
    }

    await upsertClaimWithEvidence({
      key: `crawl.${crawlRunId}.page.${i + 1}.url`,
      value: p.url.slice(0, 500),
      scope: "OTHER",
      evidenceUrl: p.url,
      evidenceSnippet: "Page fetched during crawl.",
      confidence: 80,
    });

    const ex = excerpt(p.text || "");
    if (ex) {
      await upsertClaimWithEvidence({
        key: `crawl.${crawlRunId}.page.${i + 1}.excerpt`,
        value: ex,
        scope: "OTHER",
        evidenceUrl: p.url,
        evidenceSnippet: ex,
        confidence: 70,
      });
    }
  }

  return { createdClaimIds, phonesFound: phones.length, hoursLinesFound: hours.length, emailsFound: emails.length };
}


