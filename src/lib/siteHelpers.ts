import { env } from "@/lib/env";
import { getDomainFromSearchParams } from "@/lib/domain";

export function getSiteDomain(searchParams?: Record<string, string | string[] | undefined>) {
  // Back-compat wrapper; prefer src/lib/domain.ts for the domain contract.
  return getDomainFromSearchParams(searchParams);
}

export function buildDomainQuery(domain: string | undefined) {
  const params = new URLSearchParams();
  if (domain) {
    params.set("domain", domain);
  }
  return params.toString() ? `?${params.toString()}` : "";
}
