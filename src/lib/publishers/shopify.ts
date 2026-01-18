import { env } from "@/lib/env";

type ShopifyConfig = {
  storeDomain: string;
  adminAccessToken: string;
  apiVersion: string;
  blogHandle: string;
  faqPageHandle: string;
};

type ShopifyResult = {
  ok: boolean;
  objectType: "page" | "article" | "product";
  shopifyId: string | number;
  publicUrl: string;
  metafieldsWrittenCount?: number;
  raw?: any;
};

function cfg(): ShopifyConfig | null {
  const storeDomain = env.SHOPIFY_STORE_DOMAIN;
  const adminAccessToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!storeDomain || !adminAccessToken) return null;
  return {
    storeDomain,
    adminAccessToken,
    apiVersion: env.SHOPIFY_API_VERSION || "2024-01",
    blogHandle: env.SHOPIFY_BLOG_HANDLE || "news",
    faqPageHandle: env.SHOPIFY_FAQ_PAGE_HANDLE || "faq",
  };
}

function shopifyAdminBase(c: ShopifyConfig) {
  return `https://${c.storeDomain}/admin/api/${c.apiVersion}`;
}

async function shopifyFetch(c: ShopifyConfig, path: string, init: RequestInit = {}) {
  const url = `${shopifyAdminBase(c)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": c.adminAccessToken,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    // Shopify often returns a helpful `errors` string/json body—surface it.
    const rawErrors = (json as any)?.errors;
    const errorsText =
      typeof rawErrors === "string"
        ? rawErrors
        : rawErrors
          ? JSON.stringify(rawErrors)
          : null;

    const looksLikeInvalidToken =
      typeof rawErrors === "string" &&
      rawErrors.toLowerCase().includes("invalid api key or access token");

    const hint = looksLikeInvalidToken
      ? " (hint: the token is rejected. Ensure SHOPIFY_STORE_DOMAIN matches the exact shop you installed your app on, and SHOPIFY_ADMIN_ACCESS_TOKEN is a valid Admin API access token for that shop (not client secret / API key). If you changed scopes, reinstall/reauthorize the app.)"
      : "";

    const err = new Error(
      `shopify_${res.status}: ${path}${errorsText ? ` — ${errorsText}` : ""}${hint}`,
    );
    (err as any).status = res.status;
    (err as any).body = json;
    (err as any).url = url;
    throw err;
  }
  return json;
}

function htmlFromText(text: string) {
  // Minimal, safe-ish conversion: preserve line breaks.
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap">${escaped}</div>`;
}

export function isShopifyEnabled() {
  return Boolean(cfg());
}

export async function upsertFaqPage(args: { domain: string; faqHandle?: string; htmlBody: string }): Promise<ShopifyResult> {
  const c = cfg();
  if (!c) throw new Error("shopify_not_configured");

  const handle = args.faqHandle || c.faqPageHandle || "faq";
  const pages = await shopifyFetch(c, `/pages.json?handle=${encodeURIComponent(handle)}`, { method: "GET" });
  const existing = Array.isArray(pages?.pages) ? pages.pages[0] : null;

  const title = "FAQ";
  if (!existing) {
    const created = await shopifyFetch(c, `/pages.json`, {
      method: "POST",
      body: JSON.stringify({ page: { title, handle, body_html: args.htmlBody, published: true } }),
    });
    const page = created?.page;
    return {
      ok: true,
      objectType: "page",
      shopifyId: page?.id,
      publicUrl: `https://${c.storeDomain}/pages/${handle}`,
      raw: page,
    };
  }

  const updated = await shopifyFetch(c, `/pages/${existing.id}.json`, {
    method: "PUT",
    body: JSON.stringify({ page: { id: existing.id, title, handle, body_html: args.htmlBody } }),
  });
  const page = updated?.page;
  return {
    ok: true,
    objectType: "page",
    shopifyId: page?.id || existing.id,
    publicUrl: `https://${c.storeDomain}/pages/${handle}`,
    raw: page,
  };
}

async function findBlogIdByHandle(c: ShopifyConfig): Promise<number | null> {
  // REST blogs list does not reliably expose handle; we match by "handle" if present else fallback to first blog.
  const json = await shopifyFetch(c, `/blogs.json`, { method: "GET" });
  const blogs = Array.isArray(json?.blogs) ? json.blogs : [];
  const byHandle = blogs.find((b: any) => String(b?.handle || "").toLowerCase() === String(c.blogHandle || "").toLowerCase());
  return (byHandle?.id as number) || (blogs[0]?.id as number) || null;
}

export async function createOrUpdateBlogArticle(args: {
  title: string;
  bodyMarkdown: string;
  existingArticleId?: string | number | null;
}): Promise<ShopifyResult> {
  const c = cfg();
  if (!c) throw new Error("shopify_not_configured");

  const blogId = await findBlogIdByHandle(c);
  if (!blogId) throw new Error("shopify_blog_not_found");

  const bodyHtml = htmlFromText(args.bodyMarkdown);

  if (args.existingArticleId) {
    const updated = await shopifyFetch(c, `/blogs/${blogId}/articles/${args.existingArticleId}.json`, {
      method: "PUT",
      body: JSON.stringify({ article: { id: args.existingArticleId, title: args.title, body_html: bodyHtml } }),
    });
    const article = updated?.article;
    return {
      ok: true,
      objectType: "article",
      shopifyId: article?.id || args.existingArticleId,
      publicUrl: `https://${c.storeDomain}/blogs/${c.blogHandle}/${article?.handle || ""}`.replace(/\/$/, ""),
      raw: article,
    };
  }

  const created = await shopifyFetch(c, `/blogs/${blogId}/articles.json`, {
    method: "POST",
    body: JSON.stringify({ article: { title: args.title, body_html: bodyHtml, published: true } }),
  });
  const article = created?.article;
  return {
    ok: true,
    objectType: "article",
    shopifyId: article?.id,
    publicUrl: `https://${c.storeDomain}/blogs/${c.blogHandle}/${article?.handle || ""}`.replace(/\/$/, ""),
    raw: article,
  };
}

type MetafieldWrite = { key: string; value: string; type: string };

function productMetafieldsFromDraft(args: {
  verifiedSummary: string;
  verifiedFacts: string;
  trustSignals: string;
  llmGapFixed: boolean;
  lastVerifiedAtIso: string;
  extras?: Partial<Record<string, string>>;
}): MetafieldWrite[] {
  const out: MetafieldWrite[] = [];

  // Required subset (per acceptance criteria)
  out.push({ key: "verified_summary", value: args.verifiedSummary, type: "single_line_text_field" });
  out.push({ key: "verified_facts", value: args.verifiedFacts, type: "multi_line_text_field" });
  out.push({ key: "trust_signals", value: args.trustSignals, type: "multi_line_text_field" });
  out.push({ key: "llm_gap_fixed", value: args.llmGapFixed ? "true" : "false", type: "boolean" });
  out.push({ key: "last_verified_at", value: args.lastVerifiedAtIso, type: "date_time" });

  // Optional extras using the pre-created key set (only if provided)
  const extras = args.extras || {};
  const allowed = [
    "care",
    "occasion",
    "fit",
    "materials",
    "local_availability_note",
    "recommended_use_cases",
    "trust_signals",
    "verified_facts",
    "verified_summary",
  ] as const;

  for (const k of allowed) {
    const v = extras[k];
    if (!v) continue;
    out.push({ key: k, value: String(v), type: "multi_line_text_field" });
  }

  return out;
}

async function findProductByHandle(c: ShopifyConfig, handle: string) {
  const json = await shopifyFetch(c, `/products.json?handle=${encodeURIComponent(handle)}`, { method: "GET" });
  const products = Array.isArray(json?.products) ? json.products : [];
  return products[0] || null;
}

export async function updateProductMetafields(args: {
  productHandle: string;
  verifiedSummary: string;
  verifiedFacts: string;
  trustSignals: string;
  llmGapFixed: boolean;
  lastVerifiedAtIso: string;
}): Promise<ShopifyResult> {
  const c = cfg();
  if (!c) throw new Error("shopify_not_configured");

  const product = await findProductByHandle(c, args.productHandle);
  if (!product) throw new Error(`shopify_product_not_found:${args.productHandle}`);

  const metafields = productMetafieldsFromDraft({
    verifiedSummary: args.verifiedSummary,
    verifiedFacts: args.verifiedFacts,
    trustSignals: args.trustSignals,
    llmGapFixed: args.llmGapFixed,
    lastVerifiedAtIso: args.lastVerifiedAtIso,
  });

  let written = 0;
  for (const mf of metafields) {
    await shopifyFetch(c, `/products/${product.id}/metafields.json`, {
      method: "POST",
      body: JSON.stringify({
        metafield: {
          namespace: "trusteye",
          key: mf.key,
          type: mf.type,
          value: mf.value,
        },
      }),
    });
    written += 1;
  }

  return {
    ok: true,
    objectType: "product",
    shopifyId: product.id,
    publicUrl: `https://${c.storeDomain}/products/${product.handle}`,
    metafieldsWrittenCount: written,
    raw: { product: { id: product.id, handle: product.handle }, written },
  };
}

