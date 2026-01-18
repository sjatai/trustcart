import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";

type ClaimScope = "BUSINESS" | "LOCATION" | "SERVICE" | "OTHER";

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    // keep query (some sites rely on it), but trim tracking params
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"].forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch {
    return null;
  }
}

function sameDomain(url: URL, domain: string) {
  const host = url.hostname.toLowerCase();
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

function extractTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 200) : null;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
}

function extractLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (!raw) continue;
    if (raw.startsWith("#")) continue;
    if (raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    try {
      const u = new URL(raw, base);
      out.push(u.toString());
    } catch {
      // ignore
    }
  }
  return out;
}

function safeTextSnippet(text: string | null | undefined, max = 220) {
  if (!text) return null;
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return out;
}

function typeMatches(t: unknown, candidates: string[]) {
  if (!t) return false;
  const c = candidates.map((x) => x.toLowerCase());
  if (typeof t === "string") return c.includes(t.toLowerCase());
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && c.includes(x.toLowerCase()));
  return false;
}

function normalizePhone(raw: string) {
  const s = raw.replace(/\s+/g, " ").trim();
  // keep + and digits
  const cleaned = s.replace(/[^+\d]/g, "");
  if (cleaned.length < 8) return s;
  return s;
}

function normalizeAddress(addr: any): string | null {
  if (!addr) return null;
  if (typeof addr === "string") return addr.replace(/\s+/g, " ").trim();
  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
    addr.addressCountry,
  ]
    .filter(Boolean)
    .map((x: any) => String(x).replace(/\s+/g, " ").trim());
  return parts.length ? parts.join(", ") : null;
}

function dayKey(day: string) {
  const d = day.toLowerCase();
  if (d.includes("monday")) return "mon";
  if (d.includes("tuesday")) return "tue";
  if (d.includes("wednesday")) return "wed";
  if (d.includes("thursday")) return "thu";
  if (d.includes("friday")) return "fri";
  if (d.includes("saturday")) return "sat";
  if (d.includes("sunday")) return "sun";
  return null;
}

function buildHoursClaimsFromJsonLd(obj: any): Array<{ key: string; value: string; snippet: string | null }> {
  const out: Array<{ key: string; value: string; snippet: string | null }> = [];

  const spec = obj?.openingHoursSpecification;
  // If openingHours is a string/array (e.g. "Mo-Fr 09:00-18:00") keep it as a single claim.
  const oh = obj?.openingHours;
  if (typeof oh === "string") {
    out.push({ key: "hours.weekly", value: oh, snippet: safeTextSnippet(oh) });
  } else if (Array.isArray(oh) && oh.length) {
    out.push({ key: "hours.weekly", value: oh.join("; "), snippet: safeTextSnippet(oh.join("; ")) });
  }

  if (Array.isArray(spec)) {
    for (const item of spec) {
      const days = item?.dayOfWeek;
      const opens = item?.opens;
      const closes = item?.closes;
      const value = opens && closes ? `${opens}–${closes}` : opens || closes ? String(opens || closes) : null;
      if (!value) continue;

      const addOne = (d: string) => {
        const k = dayKey(d);
        if (!k) return;
        out.push({ key: `hours.${k}`, value, snippet: safeTextSnippet(`${d}: ${value}`) });
      };

      if (typeof days === "string") addOne(days);
      else if (Array.isArray(days)) {
        for (const d of days) if (typeof d === "string") addOne(d);
      }
    }
  }

  return out;
}

async function ensureDefaultLocation(customerId: string) {
  // For demo: use a deterministic single location if none exist.
  const existing = await prisma.location.findFirst({ where: { customerId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.location.create({
    data: {
      customerId,
      name: "Main Location",
      slug: "main",
    },
  });
}

async function upsertClaimWithEvidence(args: {
  customerId: string;
  locationId: string | null;
  scope: ClaimScope;
  key: string;
  value: string;
  confidence?: number;
  freshnessAt?: Date | null;
  crawlRunId?: string;
  url: string;
  snippet?: string | null;
}) {
  const existing = await prisma.claim.findFirst({
    where: {
      customerId: args.customerId,
      locationId: args.locationId,
      key: args.key,
    },
    orderBy: { updatedAt: "desc" },
  });

  const claim = existing
    ? await prisma.claim.update({
        where: { id: existing.id },
        data: {
          value: args.value,
          scope: args.scope as any,
          confidence: args.confidence ?? existing.confidence,
          freshnessAt: args.freshnessAt ?? existing.freshnessAt,
        },
      })
    : await prisma.claim.create({
        data: {
          customerId: args.customerId,
          locationId: args.locationId,
          scope: args.scope as any,
          key: args.key,
          value: args.value,
          confidence: args.confidence ?? 70,
          freshnessAt: args.freshnessAt ?? null,
        },
      });

  // Evidence: add a row for this crawl if url is present; tolerate duplicates.
  await prisma.evidence.create({
    data: {
      claimId: claim.id,
      crawlRunId: args.crawlRunId || null,
      url: args.url,
      snippet: args.snippet || null,
    },
  });

  return claim;
}

function regexFindPhone(text: string | null) {
  if (!text) return null;
  const m = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  return m ? normalizePhone(m[1]) : null;
}

function regexFindAddress(text: string | null) {
  if (!text) return null;
  // Very light heuristic: look for "Address" followed by a short line-like chunk.
  const m = text.match(/Address\s*[:\-]?\s*([^\n\r]{10,120})/i);
  if (m && m[1]) return m[1].replace(/\s+/g, " ").trim();
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "TrustEyeCrawler/0.1 (demo; contact: demo@trusteye.ai)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || contentType === "";
    const text = isHtml ? await res.text() : "";
    return { ok: res.ok, status: res.status, html: text };
  } finally {
    clearTimeout(t);
  }
}

export async function crawlDomain({
  customerId,
  domain,
  maxPages = 25,
}: {
  customerId: string;
  domain: string;
  maxPages?: number;
}) {
  // Real crawl guardrails: bounded but not artificially tiny.
  const perPageTimeoutMs = Number(process.env.TRUSTEYE_CRAWL_TIMEOUT_MS || 7000);
  const overallDeadlineMs = Number(process.env.TRUSTEYE_CRAWL_DEADLINE_MS || 45_000);
  const deadlineAt = Date.now() + overallDeadlineMs;

  const run = await prisma.crawlRun.create({
    data: {
      customerId,
      domain,
      maxPages,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  await writeReceipt({
    customerId,
    kind: "READ",
    actor: "CRAWLER",
    summary: "Crawl started",
    input: { domain, crawlRunId: run.id, maxPages, perPageTimeoutMs, overallDeadlineMs },
  });

  const seed = normalizeUrl(`https://${domain}/`) || `https://${domain}/`;
  const queue: string[] = [seed];
  const seen = new Set<string>();

  let stored = 0;
  let failures = 0;

  while (queue.length > 0 && stored < maxPages) {
    if (Date.now() > deadlineAt) break;
    const next = queue.shift()!;
    const normalized = normalizeUrl(next);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    let base: URL;
    try {
      base = new URL(normalized);
    } catch {
      continue;
    }
    if (!sameDomain(base, domain)) continue;

    let html = "";
    let statusCode: number | null = null;
    try {
      const res = await fetchWithTimeout(normalized, perPageTimeoutMs);
      statusCode = res.status;
      html = res.html || "";
      if (!res.ok) failures += 1;
    } catch {
      failures += 1;
      statusCode = 0;
      html = "";
    }

    const title = html ? extractTitle(html) : null;
    const text = html ? stripHtml(html) : null;

    await prisma.crawlPage.upsert({
      where: { crawlRunId_url: { crawlRunId: run.id, url: normalized } },
      update: { title, html: html || null, text, statusCode: statusCode ?? null, fetchedAt: new Date() },
      create: { crawlRunId: run.id, url: normalized, title, html: html || null, text, statusCode: statusCode ?? null },
    });

    stored += 1;

    if (html) {
      const links = extractLinks(html, base)
        .map((u) => normalizeUrl(u))
        .filter((u): u is string => Boolean(u));

      for (const u of links) {
        if (queue.length + stored >= maxPages * 4) break; // guard
        if (!seen.has(u)) queue.push(u);
      }
    }
  }

  // --- Deterministic extraction phase: claims + evidence from crawled pages ---
  // Goal: populate DB-driven pages with real facts (hours/phone/address/services) without LLM.
  const location = await ensureDefaultLocation(customerId);

  const pages = await prisma.crawlPage.findMany({
    where: { crawlRunId: run.id },
    orderBy: { fetchedAt: "desc" },
    take: Math.min(50, stored + 5),
    select: { url: true, html: true, text: true, title: true },
  });

  let extracted = 0;
  let primaryPhone: string | null = null;

  for (const p of pages) {
    const html = p.html || "";
    const text = p.text || null;

    // 1) JSON-LD first (most reliable)
    const jsonld = html ? extractJsonLd(html) : [];
    for (const obj of jsonld) {
      const isBiz = typeMatches(obj?.["@type"], [
        "LocalBusiness",
        "AutoDealer",
        "AutomotiveBusiness",
        "CarDealer",
        "AutoRepair",
      ]);
      if (!isBiz) continue;

      if (obj?.name) {
        await upsertClaimWithEvidence({
          customerId,
          locationId: location.id,
          scope: "BUSINESS",
          key: "business.name",
          value: String(obj.name).slice(0, 140),
          confidence: 85,
          freshnessAt: new Date(),
          crawlRunId: run.id,
          url: p.url,
          snippet: safeTextSnippet(String(obj.name)),
        });
        extracted += 1;
      }

      const phone = obj?.telephone || obj?.phone;
      if (phone) {
        const phoneVal = normalizePhone(String(phone));
        // Only record a phone once per crawl run (avoid repeating the same phone across many pages).
        if (!primaryPhone || primaryPhone !== phoneVal) {
          if (!primaryPhone) primaryPhone = phoneVal;
          await upsertClaimWithEvidence({
            customerId,
            locationId: location.id,
            scope: "LOCATION",
            key: "location.phone",
            value: phoneVal,
            confidence: 85,
            freshnessAt: new Date(),
            crawlRunId: run.id,
            url: p.url,
            snippet: `Phone found in crawl text: ${phoneVal}`,
          });
          extracted += 1;
        }
      }

      const addr = normalizeAddress(obj?.address);
      if (addr) {
        await upsertClaimWithEvidence({
          customerId,
          locationId: location.id,
          scope: "LOCATION",
          key: "location.address",
          value: addr,
          confidence: 80,
          freshnessAt: new Date(),
          crawlRunId: run.id,
          url: p.url,
          snippet: safeTextSnippet(addr),
        });
        extracted += 1;
      }

      // Hours
      const hoursClaims = buildHoursClaimsFromJsonLd(obj);
      for (const hc of hoursClaims) {
        await upsertClaimWithEvidence({
          customerId,
          locationId: location.id,
          scope: "LOCATION",
          key: hc.key,
          value: hc.value,
          confidence: 80,
          freshnessAt: new Date(),
          crawlRunId: run.id,
          url: p.url,
          snippet: hc.snippet,
        });
        extracted += 1;
      }
    }

    // 2) Regex fallback (best-effort)
    const phoneRx = regexFindPhone(text);
    if (phoneRx) {
      // Only record a phone once per crawl run (avoid repeating the same phone across many pages).
      if (primaryPhone && primaryPhone === phoneRx) {
        // already recorded
      } else if (!primaryPhone) {
        primaryPhone = phoneRx;
        await upsertClaimWithEvidence({
          customerId,
          locationId: location.id,
          scope: "LOCATION",
          key: "location.phone",
          value: phoneRx,
          confidence: 60,
          freshnessAt: new Date(),
          crawlRunId: run.id,
          url: p.url,
          snippet: `Phone found in crawl text: ${phoneRx}`,
        });
        extracted += 1;
      }
    }

    const addrRx = regexFindAddress(text);
    if (addrRx) {
      await upsertClaimWithEvidence({
        customerId,
        locationId: location.id,
        scope: "LOCATION",
        key: "location.address",
        value: addrRx,
        confidence: 55,
        freshnessAt: new Date(),
        crawlRunId: run.id,
        url: p.url,
        snippet: safeTextSnippet(addrRx),
      });
      extracted += 1;
    }

    // 3) Service hints: derive coarse topics from page titles/urls
    const u = p.url.toLowerCase();
    const t = (p.title || "").toLowerCase();
    const topics: string[] = [];
    const pushTopic = (x: string) => {
      if (!topics.includes(x)) topics.push(x);
    };
    if (u.includes("service") || t.includes("service")) pushTopic("Service");
    if (u.includes("inventory") || t.includes("inventory")) pushTopic("Inventory");
    if (u.includes("finance") || t.includes("finance") || t.includes("financing")) pushTopic("Financing");
    if (u.includes("parts") || t.includes("parts")) pushTopic("Parts");
    if (u.includes("schedule") || t.includes("schedule")) pushTopic("Scheduling");

    if (topics.length) {
      await upsertClaimWithEvidence({
        customerId,
        locationId: location.id,
        scope: "SERVICE",
        key: "service.topics",
        value: topics.join(", "),
        confidence: 55,
        freshnessAt: new Date(),
        crawlRunId: run.id,
        url: p.url,
        snippet: safeTextSnippet(p.title || p.url),
      });
      extracted += 1;
    }
  }

  await writeReceipt({
    customerId,
    kind: "EXECUTE",
    actor: "CRAWLER",
    summary: "Extraction completed (claims + evidence)",
    output: { crawlRunId: run.id, extracted, locationSlug: location.slug },
  });
  // --- End extraction phase ---

  const status = failures > 0 && stored === 0 ? "FAILED" : "COMPLETED";
  await prisma.crawlRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      error:
        status === "FAILED"
          ? "No pages fetched (network blocked or domain unreachable)."
          : Date.now() > deadlineAt
            ? "Crawl stopped early (time budget)."
            : null,
    },
  });

  await writeReceipt({
    customerId,
    kind: "READ",
    actor: "CRAWLER",
    summary: "Crawl completed",
    output: { crawlRunId: run.id, storedPages: stored, failures, status },
  });

  return { crawlRunId: run.id, storedPages: stored, failures, status };
}


