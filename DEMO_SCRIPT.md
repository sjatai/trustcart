# See chat for full DEMO_SCRIPT.md (paste into repo if desired)
# DEMO_SCRIPT.md — TrustEye Board Demo (30 minutes, no PPT)
Customer: Reliable Nissan (reliablenissan.com)
Mode: `/mission-control?presentation=true`
Layout: Left Chat | Center Demo Site | Right Rail (Intent | Knowledge | Scores | Receipts)

## OVERLAY RULES
- Subtitles appear bottom-center for ~2.5s
- Keep them short and punchy
- They trigger on agent milestones (not manual clicks)

---

## 0) Opening (30 seconds)
You say:
“Discovery is moving from listings to LLM answers and AI agents.
Birdeye already owns trust signals (reviews, listings accuracy).
TrustEye is the next evolution: an AI operating layer that makes Birdeye the authority in the AI internet.”

Overlay:
- “The AI internet needs an authority layer.”

---

## 1) Onboard: Crawl → Knowledge/Trust Graph (5 minutes)
Chat:
“Onboard reliablenissan.com”

Expected system actions:
- Runs crawler (max 25 pages)
- Extracts facts (hours, locations, service, financing/trade-in)
- Creates Claims + Evidence + Freshness

Show:
- Right Rail → Knowledge tab
- Click a Claim → show Evidence URLs/snippets

Overlay:
- “Authority starts with verified facts.”

Punchline:
“We don’t generate opinions. We generate proof.”

---

## 2) Intent/Question Graph (7 minutes)
Chat:
“Generate intent graph for Reliable Nissan (top 20)”

Show:
- Right Rail → Intent tab
- Beautiful cluster graph by taxonomy
- Click node: “Do you finance bad credit?”
  - Show why it matters
  - Missing proof
  - Recommend asset type

Overlay:
- “Demand is answered questions.”

Punchline:
“Demand doesn’t come from promotion — it comes from answers.”

---

## 3) LLM Probes + AI Visibility Baseline (5 minutes)
Chat:
“Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.”

Show:
- Right Rail → Scores tab
- Baseline: Coverage/Specificity/Proof/Freshness/AI readiness

Overlay:
- “We test what AI believes.”

Punchline:
“We don’t guess what the model knows. We verify it.”

---

## 4) Generate Trust Pack + Approval (7 minutes)
Chat:
“Generate Trust Pack for top 5 gaps and route for approval.”

Show:
- Draft assets list (FAQ, blogs, truth blocks)
- Approve and publish top 2 live:
Chat:
“Approve and publish the top 2 assets.”

Show:
- Center demo site updates:
  - `/site/faq` now populated
  - `/site/blog` has posts
  - truth blocks appear on finance/service pages

Overlay:
- “We publish verified answers.”

Punchline:
“This is not content marketing. This is trust manufacturing.”

---

## 5) Re-probe Lift (3 minutes)
Chat:
“Re-run probes. Show before/after delta.”

Show:
- Score goes up
- Answers become more specific
- Optionally show citations to your newly published pages

Overlay:
- “Visibility becomes measurable.”

Punchline:
“We turned a vague AI presence into trusted answers.”

---

## 6) Growth Execution (3 minutes)
Chat:
“Launch a test-drive campaign; only if safe. Dry-run if needed.”

Expected:
- Trust Score computed
- Policy engine gates unsafe segments
- Campaign created + receipts logged

Show:
- Right Rail → Receipts tab
- Show audit ledger / ActivityEvents

Overlay:
- “Automation is gated by trust.”

Punchline:
“Same automation — now with judgment.”

---

## 7) Close (60 seconds)
Chat:
“Summarize outcomes and next 3 highest ROI moves.”

System returns:
- What we improved
- Score delta
- What executed
- Next 3 actions

Overlay:
- “Birdeye stays the system of record.”
- “TrustEye is the operating layer.”

Final line:
“We didn’t build a new dashboard. We built a new way to run Birdeye.”