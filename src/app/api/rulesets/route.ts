import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || getDomainFromRequest(req) || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com";
  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

  const ruleSets = await prisma.ruleSet.findMany({
    where: { customerId: customer.id },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json({ ok: true, customer: { id: customer.id, domain }, ruleSets });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const domain =
    url.searchParams.get("domain") ||
    body?.domain ||
    getDomainFromRequest(req) ||
    env.NEXT_PUBLIC_DEMO_DOMAIN ||
    "sunnystep.com";
  const customer = await getCustomerByDomain(domain).catch(() => null);
  if (!customer) return Response.json({ ok: false, error: "customer_not_found" }, { status: 404 });

  const name: string = body?.name || "";
  const description: string | undefined = body?.description || undefined;
  const json = body?.json ?? {};

  const created = await prisma.ruleSet.create({
    data: { customerId: customer.id, name, description, json, active: true },
  });
  return Response.json({ ok: true, ruleSet: created });
}


