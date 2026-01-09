# LangGraph Skeleton (TrustEye)

This repo includes a minimal LangGraph orchestration skeleton:
- AnalyzerAgent → AIOAgent → KnowledgeAgent → TrustAgent → GrowthAgent → Reporter

## Install deps
Add these (versions can be latest):
```bash
pnpm add @langchain/langgraph langchain zod
```

Optional provider SDKs (when you wire real probes):
```bash
pnpm add @langchain/openai @langchain/google-genai
```

## API
POST `/api/chat`
Body:
```json
{ "message": "Onboard reliablenissan.com", "customerDomain": "reliablenissan.com" }
```

Response contains:
- `assistantMessage`
- `steps[]` (read/decide/do/receipts)
- `overlays[]` (subtitle cues)

## Next wiring steps
- Replace agent stubs with real implementations:
  - KnowledgeAgent: crawler + claims/evidence persistence
  - AIOAgent: probe runner + visibility scoring
  - TrustAgent: trust score + gating decisions
  - GrowthAgent: campaign creation + receipts
- Persist receipts to `ActivityEvent` in Postgres
