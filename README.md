# TrustEye.ai — Demo Sprint (Reliable Nissan)

This repo builds a working end-to-end demo of TrustEye:
Intent → Content → Trust → Growth, driven from `/mission-control`.

## Stack
- Next.js (App Router) + TypeScript
- Postgres + Prisma
- LangGraph (Node/TS)
- React Flow (Intent Graph)

## Quickstart
1) Install deps
```bash
pnpm i
```

2) Start Postgres
```bash
docker compose up -d
```

3) Configure env
Create a `.env` file with at least:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trusteye?schema=public"
NEXT_PUBLIC_DEMO_DOMAIN="reliablenissan.com"
DEMO_SIMULATE_PROBES="true"
```

4) Migrate + seed
```bash
pnpm prisma:migrate
pnpm prisma:seed
```

5) Run
```bash
pnpm dev
```

Open:
- http://localhost:3000/mission-control
- http://localhost:3000/site
- http://localhost:3000/admin

## Demo mode
Use:
- `/mission-control?presentation=true`

## Notes
- If OpenAI/Gemini keys are missing, the probe runner should operate in simulated mode.
