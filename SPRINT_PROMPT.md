# See chat for full SPRINT_PROMPT.md (paste into repo if desired)
# SPRINT_PROMPT.md — TrustEye.ai
## 8-Day Board-Ready Demo Sprint (Block-by-Block Execution)

Demo Customer: reliablenissan.com  
Audience: CEO, COO, CRO, CPO, CMO  
Mode: Live demo, no slides  
Primary Surface: /mission-control  
Secondary Surface: /site (demo customer site)

---

## HOW TO USE THIS FILE (IMPORTANT)

- You must execute this sprint **block by block**
- Do NOT skip blocks
- Do NOT expand scope
- Stop after each block and wait for approval
- This is a **real working product**, not a mock

Cursor / Claude must:
1. Read this file before coding
2. Execute **one block only**
3. Stop and confirm completion

---

## PRODUCT TRUTH (DO NOT BREAK)

1. Birdeye remains the **system of record**
2. TrustEye is an **AI operating layer**, not a new dashboard
3. All actions are:
   Intent → Reasoning → Trust gating → Execution → Receipt
4. Mission Control chat is the **only control plane**
5. Dashboards are audit surfaces, not control surfaces
6. Automation without trust is forbidden
7. Demo must feel **enterprise-safe and inevitable**

---

## TRUSTEYE PILLARS (MENTAL MODEL)

1. **Intent**
   - What customers are trying to do
   - What questions block demand
   - What AI agents ask before acting

2. **Content**
   - Verified answers, not marketing copy
   - FAQs, truth blocks, blogs, schema, llms.txt
   - Built from real facts + evidence

3. **Trust**
   - Reviews, accuracy, recency, responsiveness
   - Determines what AI is allowed to do
   - Separate from Birdeye Score

4. **Growth**
   - Campaigns and asks executed only when safe
   - Receipts logged
   - No overlapping or reckless automation

---

# BLOCK 0 — Repo & Infra (DONE)

Scaffold exists. Do not redo.

---

# BLOCK 1 — Data Model (DONE)

Prisma schema exists. Do not redesign.

---

# BLOCK 2 — DESIGN SYSTEM (NON-NEGOTIABLE)

## Objective
Implement a premium, consistent UI system per DESIGN_SPEC.md.

## Scope
- Mission Control layout (3 columns)
- Panels, cards, typography
- Subtitle overlay system
- Right rail tabs
- Agent step cards

## Pages
- /mission-control
- /mission-control?presentation=true

## Definition of Done
- UI looks premium and intentional
- No default Next.js styles visible
- Subtitle overlays work
- Right rail tabs render correctly
- STOP after completion

---

# BLOCK 3 — Demo Customer Site (/site)

## Objective
Create a stable, realistic demo site for reliablenissan.com

## Pages
- /site
- /site/inventory
- /site/service
- /site/finance
- /site/faq
- /site/blog
- /site/blog/[slug]
- /site/locations
- /site/locations/[slug]

## Features
- Featured Experience chips:
  - Trade-in value
  - Bad credit financing
  - Service specials
  - Test drive
- Clicking chips emits session events
- Hero + CTA adapt based on inferred intent

## Definition of Done
- Events recorded
- Hero/CTA adapts
- Site looks real and credible

---

# BLOCK 4 — Session Graph API

## Objective
Expose a single JSON endpoint describing live visitor intent.

## API
GET /api/graph/session

Returns:
- sessionId
- primaryIntent
- confidence (0–100)
- lastEvents
- recommendedExperience
- auditSummary

## Definition of Done
- JSON updates in real time as site is used
- Mission Control can read and display it

---

# BLOCK 5 — Crawler

## Objective
Crawl reliablenissan.com safely.

## Rules
- Domain limited
- Max 25 pages
- Deduplicated
- Timeout protected

## Storage
- CrawlRun
- CrawlPage

## Definition of Done
- Crawl completes
- Pages stored and viewable

---

# BLOCK 6 — Knowledge / Trust Graph

## Objective
Convert crawl data into verified facts.

## Output
Claims:
- Hours
- Locations
- Services
- Financing
- Policies

Each Claim must have:
- Evidence (URL + snippet)
- Freshness timestamp

## Definition of Done
- ≥20 claims created
- Evidence visible

---

# BLOCK 7 — Intent / Question Graph (WOW ARTIFACT)

## Objective
Reveal demand-blocking questions.

## Requirements
- 20 questions
- Taxonomy:
  - availability
  - suitability
  - risk
  - cost_value
  - next_step
- Each question has:
  - impactScore
  - state
  - missing proof
  - recommended asset type

## UI
- Clustered graph (React Flow)
- Node size = impact
- Color = state
- Click → drawer with actions

## Definition of Done
- Graph is beautiful
- Clickable and explanatory

---

# BLOCK 8 — LLM Probes + AI Visibility Score

## Objective
Measure what LLMs believe.

## Providers
- ChatGPT
- Gemini
- Simulated fallback allowed

## Metrics
- Coverage
- Specificity
- Proof
- Freshness
- AI Readiness

## Definition of Done
- Baseline score generated
- Answers stored and inspectable

---

# BLOCK 9 — Trust Pack Generation

## Objective
Close gaps with verified content.

## Assets
- FAQ
- Blogs
- Truth blocks
- Schema
- Sitemap
- llms.txt

## Workflow
draft → approve → publish

## Definition of Done
- Assets appear on /site
- Approval required

---

# BLOCK 10 — Re-probe & Delta

## Objective
Prove lift.

## Definition of Done
- Before/after score visible
- Clear improvement shown

---

# BLOCK 11 — Trust Score + Policy Engine

## Objective
Decide what AI can do.

## Thresholds
- 0–40: Unsafe
- 41–65: Caution
- 66–80: Ready
- 81–100: Advocacy

## Definition of Done
- Allowed actions list generated
- Unsafe actions blocked

---

# BLOCK 12 — Growth Engine

## Objective
Execute demand safely.

## Example
- Test drive campaign
- Dry run by default
- Receipts logged

## Definition of Done
- Campaign executed
- Receipts visible

---

# BLOCK 13 — LangGraph Orchestration

## Objective
Run everything via agents.

## Agents
Analyzer → AIO → Knowledge → Trust → Growth → Reporter

## Commands (must work)
- Onboard reliablenissan.com
- Generate intent graph
- Probe ChatGPT + Gemini
- Generate Trust Pack
- Approve and publish
- Re-probe delta
- Launch campaign
- Summarize outcomes

## Definition of Done
- Entire demo runs from chat

---

# BLOCK 14 — Final Polish

## Objective
Board-ready experience.

## Definition of Done
- No dead ends
- Smooth demo
- Looks inevitable