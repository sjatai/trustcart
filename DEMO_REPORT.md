## TrustEye SunnyStep demo status (end-to-end)

### Target
- **Domain**: `sunnysteps.com` (domain-scoped via `?domain=...` everywhere)
- **Goal**: Crawl/Knowledge → Questions → Recommendations → Draft → Edit → Publish → `/site/*` reflects → Receipts prove it

### What works now
- **Domain-scoping (no cross-domain writes/reads)**:
  - Core API routes resolve customer via `?domain=` and fetch via `getCustomerByDomain()` (no implicit customer creation).
  - Mission Control demo iframe always includes `?domain=<selected>`.
- **DB-driven demo site**:
  - `/site`, `/site/products`, `/site/faq`, `/site/blog` render from DB for the selected domain.
  - Non-SunnyStep sections (`/site/inventory`, `/site/finance`, `/site/service`, `/site/locations`) are now “not part of demo” pointers to the real demo surfaces.
- **Real publish pipeline (Draft → Edit → Approve → Publish)**:
  - `POST /api/recommendations/[id]/draft?domain=...` generates a **domain-scoped** draft using:
    - Verified claims + evidence (`Claim` + `Evidence` for that customerId)
    - Stored probe answers (`ProbeRun` + `ProbeAnswer` for that customerId, if present)
  - Draft edits are persisted as a new **AssetVersion** (status stays `DRAFT`).
  - `POST /api/recommendations/[id]/approve?domain=...` marks the draft `APPROVED`.
  - `POST /api/recommendations/[id]/publish?domain=...` marks it `PUBLISHED` and it appears immediately on `/site/faq` or `/site/blog`.
  - Publishing is **blocked** if the draft contains `[NEEDS_VERIFICATION: ...]` markers (safety switch), with `missingClaims` returned.
- **Receipts**:
  - Draft generation/edit and publish writes `Receipt` rows (`kind`, `actor`, `summary`, `input`, `output`).

### One-command verification
- Smoke test script (hits live HTTP endpoints end-to-end):
  - `npm run smoke:domain-flow` (requires `TRUSTEYE_BASE_URL` and optional `TRUSTEYE_DOMAIN`)

### Notes
- If publish blocks due to missing claims (expected), you can seed minimal verified claims for demo:
  - `npm run demo:seed-claims -- --domain sunnysteps.com`

