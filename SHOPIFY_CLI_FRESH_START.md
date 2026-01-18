## Shopify CLI fresh start (2026) — recommended path

Shopify’s “legacy custom app” flow is changing (and often blocked in Admin UI). The most reliable way to get a working app + token in 2026 is: **Shopify CLI → create app → dev tunnel → install → use the Admin API access token for API calls**.

### Goal
- Get to a point where:
  - `curl https://<shop>.myshopify.com/admin/api/<version>/shop.json` works with your token
  - TrustEye demo can publish to Shopify using:
    - `SHOPIFY_STORE_DOMAIN`
    - `SHOPIFY_ADMIN_ACCESS_TOKEN`

### 0) Prereqs
- You are **store owner/admin** on `trustcart-20.myshopify.com`
- Shopify CLI installed (`shopify version`)
- Node installed (v20+ recommended)

### 1) Create a brand-new Shopify app (CLI)
Pick a new folder (outside this repo, or inside if you prefer). Example inside this repo:

```bash
cd /Users/sj/dev/BET
mkdir -p shopify-app
cd shopify-app
shopify app init
```

Choose a template you’re comfortable with (the defaults are fine).

### 2) Run local dev + install on the shop

```bash
shopify app dev
```

- The CLI will create an app record, set up an HTTPS tunnel, and give you an **install link**.
- Open the install link and install on your shop (example: `8wbik9-14.myshopify.com`).

### 3) Ensure scopes match what TrustEye publishes
TrustEye publishes:
- FAQ page (content/pages)
- Blog articles (content/articles)
- Product metafields (products/metafields)

So the Shopify app must have scopes equivalent to:
- `write_content`
- `write_products`

(Read scopes are fine too; write scopes are the important part.)

If you change scopes after install, you generally must **reinstall/reauthorize** the app.

### 4) Get an Admin API access token
Depending on Shopify’s current dashboard flow, you’ll obtain a token after install from the relevant app dashboard (token format/prefix varies).

Once you have it, set env vars for the TrustEye demo app:

```bash
export SHOPIFY_STORE_DOMAIN="8wbik9-14.myshopify.com"
export SHOPIFY_ADMIN_ACCESS_TOKEN="...your token..."
export SHOPIFY_API_VERSION="2024-01"
export SHOPIFY_BLOG_HANDLE="news"
export SHOPIFY_FAQ_PAGE_HANDLE="faq"
```

### 5) Validate from TrustEye (no more guessing)
With TrustEye dev server running, hit:

- `http://localhost:3008/api/shopify/health`

It returns:
- `ok: true` with shop info if your token works
- otherwise `status` + Shopify `errors` + a hint

### 6) Publish from TrustEye
Go to Mission Control → open a draft → enable “Publish destination: Local + Shopify” → Publish.

### Common failure modes (fast checks)
- Wrong shop domain:
  - must be exactly `trustcart-20.myshopify.com` (no protocol, no `/admin`)
- Token is not an Admin API access token (client secret / API key won’t work)
- App not installed on the shop you’re calling
- Missing scopes (`write_products`, `write_content`)

