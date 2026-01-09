# See chat for full DESIGN_SPEC.md (paste into repo if desired)
# DESIGN_SPEC.md — TrustEye UI System
## “Birdeye Clean+” (Board-Ready, AI-First)

---

## DESIGN GOAL

TrustEye must feel:
- Premium
- Calm
- Intelligent
- Enterprise-safe

This is **not** a startup toy UI.

---

## GLOBAL RULES (NON-NEGOTIABLE)

- Font: Inter (Google Font)
- Light mode only (for demo)
- Max width: 1280px
- 12-column grid
- Large whitespace
- No visual clutter
- No gradients unless subtle
- No default Next.js look

---

## COLOR SYSTEM

- Background: very light neutral gray
- Surface: white
- Borders: subtle gray (1px)
- Text: near-black
- Accent: Birdeye-style blue (used sparingly)

---

## TYPOGRAPHY

- Page title: 24–28px, semibold
- Section title: 14–16px, semibold
- Body: 14px
- Meta: 12px
- Monospace: JSON/debug only

---

## MISSION CONTROL LAYOUT

### 3-COLUMN GRID

1. **Left — Chat**
   - Fixed width (380–420px)
   - Chat bubbles (User vs TrustEye)
   - TrustEye messages include:
     - Agent cards (Read / Decide / Do / Receipts)

2. **Center — Demo Site**
   - Live iframe or shared layout
   - Always looks like a real business site
   - Featured Experience chips visible

3. **Right — Intelligence Rail**
   Tabs:
   - Intent
   - Knowledge
   - Scores
   - Receipts

---

## INTENT GRAPH (HERO ARTIFACT)

- Built with React Flow
- Clustered by taxonomy
- Node size = impactScore
- Node color:
  - Unanswered → muted gray
  - Weak → yellow
  - Answered → blue
  - Trusted → green
  - Stale → light gray
- Click opens drawer:
  - Why it matters
  - Missing proof
  - Generate asset CTA

---

## SUBTITLE OVERLAY (PRESENTATION MODE)

- Bottom center
- Semi-transparent black background
- White text
- 14px
- Auto fade in/out
- Does not block clicks

Examples:
- “Demand is answered questions.”
- “We test what AI believes.”
- “Automation is gated by trust.”

---

## COMPONENTS TO BUILD

- AppShell
- Panel
- PanelHeader
- MetricPill
- AgentStepCard
- RightRailTabs
- SubtitleOverlay
- Drawer

All components must be reusable and consistent.

---

## QUALITY BAR CHECKLIST

- No raw JSON unless collapsible
- Skeleton loaders instead of spinners
- Empty states explain what to do next
- Every action produces a receipt
- UI explains *why* something happened

---

## FINAL TEST

If an exec asks:
> “What just happened and why?”

The UI must answer without explanation.