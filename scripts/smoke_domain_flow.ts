/* eslint-disable no-console */
import "dotenv/config";

type Json = any;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function normalizeDemoDomain(domainOrUrl: string): string {
  const raw = String(domainOrUrl || "").trim();
  if (!raw) return "";
  let host = raw;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // fall through
    }
  }
  host = host.replace(/^\/\//, "");
  host = host.split("/")[0]?.split("?")[0]?.split("#")[0] || host;
  host = host.trim().toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (host === "sunnystep.com") host = "sunnysteps.com";
  return host;
}

async function getJson(url: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function postJson(url: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const baseUrl = mustEnv("TRUSTEYE_BASE_URL").replace(/\/$/, "");
  const domain = normalizeDemoDomain(process.env.TRUSTEYE_DOMAIN || "sunnysteps.com");

  console.log("== TrustEye smoke ==");
  console.log({ baseUrl, domain });

  // 1) Customer exists
  const customers = await getJson(`${baseUrl}/api/customers`);
  if (customers.status !== 200 || customers.json?.ok !== true) throw new Error(`customers_failed: ${customers.status}`);
  const found = (customers.json?.customers || []).some((c: any) => c?.domain === domain);
  if (!found) throw new Error(`customer_missing_in_list: ${domain}`);

  // 2) Recommendations exist (and are domain-scoped)
  const recs = await getJson(`${baseUrl}/api/content-recommendations?domain=${encodeURIComponent(domain)}`);
  if (recs.status !== 200 || recs.json?.ok !== true) throw new Error(`recs_failed: ${recs.status} ${JSON.stringify(recs.json)}`);
  const list = Array.isArray(recs.json?.recommendations) ? recs.json.recommendations : [];
  if (!list.length) throw new Error("recs_empty");
  const pick =
    list.find((r: any) => String(r?.questionText || r?.title || "").toLowerCase().includes("return")) ||
    list.find((r: any) => String(r?.questionText || r?.title || "").toLowerCase().includes("shipping")) ||
    list[0];
  const recId = pick.id;
  console.log("recommendation:", { recId, kind: pick.kind, targetUrl: pick.targetUrl });

  // 3) Draft
  const draft = await postJson(`${baseUrl}/api/recommendations/${encodeURIComponent(recId)}/draft?domain=${encodeURIComponent(domain)}`);
  if (draft.status !== 200 || draft.json?.ok !== true) throw new Error(`draft_failed: ${draft.status} ${JSON.stringify(draft.json)}`);
  const needs = draft.json?.draft?.content?.needsVerification || [];
  console.log("draft ok", { needsVerificationCount: Array.isArray(needs) ? needs.length : 0 });

  // 4) Approve
  const approve = await postJson(`${baseUrl}/api/recommendations/${encodeURIComponent(recId)}/approve?domain=${encodeURIComponent(domain)}`);
  if (approve.status !== 200 || approve.json?.ok !== true) throw new Error(`approve_failed: ${approve.status} ${JSON.stringify(approve.json)}`);
  console.log("approve ok");

  // 5) Publish (may be blocked by needs verification)
  const pub = await postJson(`${baseUrl}/api/recommendations/${encodeURIComponent(recId)}/publish?domain=${encodeURIComponent(domain)}`);
  if (pub.status !== 200 || pub.json?.ok !== true) {
    if (pub.json?.error === "needs_verification") {
      console.log("publish blocked as expected (needs_verification)", pub.json?.missingClaims || []);
      return;
    }
    throw new Error(`publish_failed: ${pub.status} ${JSON.stringify(pub.json)}`);
  }
  const targetUrl = String(pub.json?.targetUrl || "");
  if (!targetUrl) throw new Error("publish_missing_targetUrl");
  console.log("publish ok", { targetUrl });

  // 6) Site reflects: fetch target page
  const page = await fetch(`${baseUrl}${targetUrl}${targetUrl.includes("?") ? "&" : "?"}domain=${encodeURIComponent(domain)}`).then((r) => r.text());
  if (!page || page.length < 200) throw new Error("site_page_too_small");
  console.log("site page fetched", { bytes: page.length });

  // 7) Receipts exist
  const receipts = await getJson(`${baseUrl}/api/receipts?domain=${encodeURIComponent(domain)}&limit=50`);
  if (receipts.status !== 200 || receipts.json?.ok !== true) throw new Error(`receipts_failed: ${receipts.status}`);
  const rows = Array.isArray(receipts.json?.receipts) ? receipts.json.receipts : [];
  const hasPublish = rows.some((r: any) => r?.kind === "PUBLISH");
  console.log("receipts ok", { count: rows.length, hasPublish });
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});

