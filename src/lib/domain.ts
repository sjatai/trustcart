import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

export function normalizeDemoDomain(domainOrUrl: string): string {
  const raw = String(domainOrUrl || "").trim();
  if (!raw) return "";
  let host = raw;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // fall through
    }
  }
  host = host.replace(/^\/\//, "");
  host = host.split("/")[0]?.split("?")[0]?.split("#")[0] || host;
  host = host.trim().toLowerCase();

  // Treat www.* as an alias of the apex for demo.
  if (host.startsWith("www.")) host = host.slice(4);

  // SunnyStep canonicalization: accept both, but prefer the real store domain.
  if (host === "sunnysteps.com") host = "sunnystep.com";
  if (host === "sunnystep.com") return host;
  return host;
}

export function getDomainFromSearchParams(searchParams?: Record<string, string | string[] | undefined>): string {
  const candidate = searchParams?.domain;
  if (typeof candidate === "string" && candidate.length > 0) {
    return normalizeDemoDomain(candidate);
  }
  return normalizeDemoDomain(env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com") || "sunnystep.com";
}

export function getDomainFromUrl(url: URL): string {
  return normalizeDemoDomain(url.searchParams.get("domain") || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com") || "sunnystep.com";
}

export function getDomainFromRequest(req: Request): string {
  return getDomainFromUrl(new URL(req.url));
}

export async function getCustomerByDomain(domain: string) {
  const normalized = normalizeDemoDomain(domain);
  const customer = await prisma.customer.findUnique({ where: { domain: normalized } });
  if (!customer) {
    throw new Error(`customer_not_found:${normalized}`);
  }
  return customer;
}

