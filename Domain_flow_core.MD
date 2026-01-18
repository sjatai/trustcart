# TRUSTEYE — SUNNYSTEP.COM END-TO-END DEMO FLOW (REQUIREMENTS ONLY)

You are working in the TrustEye repo. Your goal is to make the **full demo flow work end-to-end for ONE domain only: `sunnysteps.com`**. Do not touch Nissan or any other domains until this works.

This is **requirements + acceptance criteria**, not an implementation guide. First, inspect what already exists, then fix what’s missing/broken. No mocks.

---

## Domain + Scope
- **Target domain:** `sunnysteps.com`
- Everything (UI, APIs, DB reads/writes, receipts) must be **domain-scoped** and never mix data across domains.
- The demo must work with our **DB-driven demo site** first. Shopify integration can come later.

---

## The Demo Story (must match UI + system behavior)
**Crawl → Knowledge → Questions → LLM Probe → Gaps → Recommendations → Draft → Edit → Approve → Publish → Site reflects change → Receipts prove it**

We are demonstrating:
1) We understand the site and can extract facts (“Knowledge”)
2) We know what customers ask + what LLMs answer (“Demand Signals”)
3) We compute gaps (missing facts OR weak LLM answers)
4) We generate recommended content/actions
5) We generate drafts, allow human edit/approve, publish
6) Published content shows on the site (demo site pages)
7) Every step is auditable (receipts)

---

## Key Definitions (be precise in code + UI)
### Knowledge
- “Knowledge” = claims/facts extracted from crawl, with evidence URLs/snippets stored.
- This is not a graph visualization requirement; it’s data that can be inspected.

### Demand Signals (replace “Intent”)
- “Demand Signals” = high-impact questions relevant to SunnyStep’s business (shipping, returns, sizing, availability, stores in SG, occasion/trend, etc.)
- These can come from question bank + customer context.
- Do not show a separate “Intent” tab. If it exists in UI, remove or ignore it. Demand Signals must be under Discovery.

### Gaps
Gaps must represent:
- **Missing Site Facts**: question needs a claim key not present in Knowledge
- **Weak / Untrusted LLM Answer**: probe answer hedges, lacks specifics, or contradicts claims
Gaps should never show “0” when there are obviously unanswered/weak questions.

### Recommendations
A recommendation exists when a question has meaningful gaps.
Recommendation must explain:
- Why it matters (impact score)
- What’s missing (gap summary)
- What asset to create (FAQ, Blog, Product detail/truth block)
- What page/section to publish into

---

## Publishing Requirements (must be REAL, not mock)
Publishing must:
- Create/Update **Asset** + **AssetVersion**
- Change status: DRAFT → APPROVED → PUBLISHED
- Immediately reflect on the DB-driven site pages:
  - `/site/faq` shows published FAQ items for sunnysteps.com
  - `/site/blog` + `/site/blog/[slug]` shows published blog posts
  - If you support product detail updates in demo site: published “truth blocks” appear on product page(s)
- All publish actions must write receipts (see below)

---

## Receipts (canonical audit trail)
Every meaningful step must write a Receipt:
- Crawl run started/completed (CRAWLER)
- Knowledge extraction/claims written (KNOWLEDGE or CRAWLER)
- Questions generated / bank applied (INTENT_ENGINE or ORCHESTRATOR)
- Probe run completed (INTENT_ENGINE)
- Recommendations generated (KNOWLEDGE or ORCHESTRATOR)
- Draft generated (CONTENT_ENGINE)
- Draft edited (CONTENT_ENGINE)
- Approved (CONTENT_ENGINE)
- Published (CONTENT_ENGINE)
- Any suppression or gating decisions (TRUST_ENGINE / RULE_ENGINE when relevant)

Receipt output should include domain/customerId and key ids (crawlRunId, probeRunId, assetId, published URL).

---

## Acceptance Criteria (what “working” means)
For `sunnysteps.com`, end-to-end must be true:

### A) Discovery shows real data
- Knowledge section lists claims with evidence from sunnysteps.com crawl
- Demand Signals show top questions (non-empty)
- Gaps show correctly (non-zero when missing facts or weak answers)
- Recommendations panel is non-empty and stable (no empty array unless truly no gaps)

### B) LLM probe is actually stored
- A probe run exists in DB for sunnysteps.com
- Probe answers are visible to the system (used for gaps + visibility scoring)
- The UI shows that the system used probe answers (even minimal)

### C) Draft → Edit → Approve → Publish works
- “Review draft” is clickable
- Draft content is not placeholder; it is generated from available Knowledge + Probe answers (and says “Not confirmed” when missing)
- Edits save as a new AssetVersion (or equivalent versioning)
- Approve changes state
- Publish changes state + makes content visible on site pages

### D) Site reflects published changes immediately
- After publish, open the corresponding site page and confirm the content is there:
  - FAQ item appears, or blog post appears, etc.
- Recommendation becomes resolved/green after publish (or equivalent)

### E) Everything is domain-safe
- Switching domain should not leak data
- APIs consistently resolve customer by domain
- No endpoints hard-code NEXT_PUBLIC_DEMO_DOMAIN in a way that overrides sunnysteps.com

---

## What to inspect (existing code references to review)
Before coding, check what already exists in these areas:

### Data + orchestration
- `src/lib/agents/*` (knowledge, aio, trust, growth, orchestrator)
- `src/lib/knowledge.ts`
- `src/lib/probes.ts`
- `src/lib/crawler.ts`
- `src/lib/receipts.ts`
- `prisma/schema.prisma`

### API routes
- `src/app/api/questions/route.ts`
- `src/app/api/knowledge/claims/route.ts`
- `src/app/api/receipts/activity/route.ts`
- `src/app/api/scores/*`
- any recommendations/content routes you already created (search under `src/app/api/`)

### UI
- `src/app/mission-control/*`
- `src/components/RightRail.tsx`
- `src/components/discovery/*` (Demand Signals, Knowledge, Recommendations)
- `src/app/site/*` (FAQ/blog rendering)

### Scripts (domain setup + probe)
- `scripts/build_question_bank.ts` (or equivalent)
- `scripts/apply_bank_to_customer.ts`
- `scripts/probe_customer_questions.ts`

---

## Deliverables
1) A short report (in repo) stating what was broken and what you fixed for sunnysteps.com.
2) A working demo flow for sunnysteps.com with visible UI proof + receipts proof.
3) A simple “demo checklist” command sequence (what I run in terminal + what I click).

Proceed by inspecting existing code first, then fix only what’s required to satisfy the acceptance criteria above.
Do not add new features beyond this scope.