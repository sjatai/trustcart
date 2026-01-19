import { z } from "zod";

const EnvSchema = z.object({
  // Demo-safe: allow missing env locally and fall back to the docker-compose default.
  DATABASE_URL: z.string().min(1).optional().default("postgresql://postgres:postgres@localhost:5432/trusteye?schema=public"),
  NEXT_PUBLIC_APP_NAME: z.string().default("TrustEye"),
  NEXT_PUBLIC_DEMO_DOMAIN: z.string().default("sunnystep.com"),
  // Optional: keep a separate customer row for repeated testing vs final demo run-through.
  NEXT_PUBLIC_TEST_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_PRESENTATION_DOMAIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEMO_SIMULATE_PROBES: z.string().optional(),

  // Shopify (publishing destination)
  SHOPIFY_STORE_DOMAIN: z.string().optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().optional().default("2024-01"),
  SHOPIFY_BLOG_HANDLE: z.string().optional().default("news"),
  SHOPIFY_FAQ_PAGE_HANDLE: z.string().optional().default("faq"),
});

export const env = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_DEMO_DOMAIN: process.env.NEXT_PUBLIC_DEMO_DOMAIN,
  NEXT_PUBLIC_TEST_DOMAIN: process.env.NEXT_PUBLIC_TEST_DOMAIN,
  NEXT_PUBLIC_PRESENTATION_DOMAIN: process.env.NEXT_PUBLIC_PRESENTATION_DOMAIN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DEMO_SIMULATE_PROBES: process.env.DEMO_SIMULATE_PROBES,

  SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION,
  SHOPIFY_BLOG_HANDLE: process.env.SHOPIFY_BLOG_HANDLE,
  SHOPIFY_FAQ_PAGE_HANDLE: process.env.SHOPIFY_FAQ_PAGE_HANDLE,
});
