## SunnyStep demo checklist (copy/paste)

### Preconditions
- Next dev server is running (in this repo it’s currently on `http://localhost:3008` if 3000–3007 are taken).
- DB migrated + seeded.

### Commands
```bash
cd /Users/sj/dev/BET

# 0) DB
npm run prisma:migrate
npm run prisma:seed

# 1) Ensure customer exists (domain can be a URL; it will normalize to hostname)
npm run customer:add -- --domain https://www.sunnystep.com/

# 2) Import + attach SunnyStep question bank (SG footwear)
npm run discovery:import-bank-json -- --file scripts/banks/sunnystep_sg_questions.json
npm run discovery:apply -- --domain https://www.sunnystep.com/ --industry ecommerce_footwear --geo SG-SG-Orchard-MBS --language en --persona consumer --top 50

# 3) (Optional) Run LLM probe and store results (requires OPENAI key in env)
npx tsx scripts/probe_customer_questions.ts --domain sunnysteps.com --provider OPENAI --mode brand_discovery --top 40

# 4) (Optional but recommended) Seed minimal verified claims to unblock publish in demo
npm run demo:seed-claims -- --domain sunnysteps.com

# 5) End-to-end smoke (draft + publish + site reflects + receipts)
TRUSTEYE_BASE_URL=http://localhost:3008 TRUSTEYE_DOMAIN=sunnysteps.com npm run smoke:domain-flow

# 6) Shopify publish (set env vars, then publish from /drafts/[id])
export SHOPIFY_STORE_DOMAIN=8wbik9-14.myshopify.com
export SHOPIFY_ADMIN_ACCESS_TOKEN=...
export SHOPIFY_API_VERSION=2024-01
export SHOPIFY_BLOG_HANDLE=news
export SHOPIFY_FAQ_PAGE_HANDLE=faq
```

### UI flow (Mission Control)
- Open `http://localhost:3008/mission-control`
x`- Paste `sunnysteps.com` into the **Domain** field → **Load**
- In **Recommendations**:
  - **Review Draft (Generate)** → **Approve & Publish**
  - Demo site iframe should jump to the published page.

### Shopify verification
- Token notes:
  - This demo needs a valid **Shopify Admin API access token** for the target shop (token format/prefix varies by Shopify flow).
  - `.env` values like `SHOPIFY_Client_ID` are **not used** by this codepath.
- Publish an FAQ recommendation:
  - Check Shopify Page: `https://8wbik9-14.myshopify.com/pages/faq`
- Publish a Blog recommendation:
  - Check Shopify Blog: `https://8wbik9-14.myshopify.com/blogs/news`
- Publish a Product update:
  - Open the Shopify product (by handle) and verify metafields under namespace `trusteye` were written.



