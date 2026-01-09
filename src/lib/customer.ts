import { prisma } from "@/lib/db";

export async function getOrCreateCustomerByDomain(domain: string) {
  return prisma.customer.upsert({
    where: { domain },
    update: {},
    create: { name: "Reliable Nissan", domain },
  });
}


