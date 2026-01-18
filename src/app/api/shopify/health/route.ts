import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  const storeDomain = env.SHOPIFY_STORE_DOMAIN;
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = env.SHOPIFY_API_VERSION || "2024-01";

  if (!storeDomain || !token) {
    return NextResponse.json(
      {
        ok: false,
        error: "shopify_not_configured",
        requiredEnv: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
        notes: [
          "This endpoint validates Shopify Admin API credentials.",
          "Use an Admin API access token for the target shop (from your app install/OAuth flow, or from the relevant dashboard flow).",
          "SHOPIFY_STORE_DOMAIN must be like '<shop>.myshopify.com' (no protocol, no /admin).",
        ],
      },
      { status: 400 },
    );
  }

  const url = `https://${storeDomain}/admin/api/${apiVersion}/shop.json`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const rawErrors = body?.errors;
      const errorsText =
        typeof rawErrors === "string"
          ? rawErrors
          : rawErrors
            ? JSON.stringify(rawErrors)
            : null;

      const looksLikeInvalidToken =
        typeof rawErrors === "string" &&
        rawErrors.toLowerCase().includes("invalid api key or access token");

      return NextResponse.json(
        {
          ok: false,
          error: "shopify_auth_failed",
          status: res.status,
          url,
          body,
          hint: looksLikeInvalidToken
            ? "Token rejected. Ensure SHOPIFY_ADMIN_ACCESS_TOKEN is a valid Admin API access token for this exact store (not API key / client secret). If you changed scopes, reinstall/reauthorize the app."
            : "Shopify call failed. Check store domain, token, API version, and required scopes.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        storeDomain,
        apiVersion,
        shop: body?.shop || body,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "shopify_fetch_failed",
        url,
        message: String(err?.message || err),
      },
      { status: 502 },
    );
  }
}

