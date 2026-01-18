import { prisma } from "@/lib/db";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      select: { id: true, domain: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return Response.json({
      ok: true,
      customers: customers.map((c) => ({
        id: c.id,
        domain: c.domain,
        name: c.name,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return Response.json(dbUnavailablePayload({ route: "/api/customers" }));
    }
    throw err;
  }
}

