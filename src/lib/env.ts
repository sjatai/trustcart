import { z } from "zod";

const EnvSchema = z.object({
  // Demo-safe: allow missing env locally and fall back to the docker-compose default.
  DATABASE_URL: z.string().min(1).optional().default("postgresql://postgres:postgres@localhost:5432/trusteye?schema=public"),
  NEXT_PUBLIC_APP_NAME: z.string().default("TrustEye"),
  NEXT_PUBLIC_DEMO_DOMAIN: z.string().default("reliablenissan.com"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEMO_SIMULATE_PROBES: z.string().optional(),
});

export const env = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_DEMO_DOMAIN: process.env.NEXT_PUBLIC_DEMO_DOMAIN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DEMO_SIMULATE_PROBES: process.env.DEMO_SIMULATE_PROBES,
});
