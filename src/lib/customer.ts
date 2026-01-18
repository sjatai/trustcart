import { prisma } from "@/lib/db";
import { normalizeDemoDomain } from "@/lib/domain";

function normalizeDomain(domainOrUrl: string): string {
  return normalizeDemoDomain(domainOrUrl);
}

export async function getOrCreateCustomerByDomain(domainOrUrl: string) {
  const domain = normalizeDomain(domainOrUrl);
  return prisma.customer.upsert({
    where: { domain },
    update: {},
    create: { name: domain, domain },
  });
}


