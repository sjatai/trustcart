import { prisma } from "@/lib/db";

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
  // Demo guardrails: keep crawl bounded so onboarding doesn't "stall".
  const perPageTimeoutMs = Number(process.env.TRUSTEYE_CRAWL_TIMEOUT_MS || 2500);
  const overallDeadlineMs = Number(process.env.TRUSTEYE_CRAWL_DEADLINE_MS || 9000);
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
            ? "Crawl stopped early (demo time budget)."
            : null,
    },
  });

  return { crawlRunId: run.id, storedPages: stored, failures, status };
}


