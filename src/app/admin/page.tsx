import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main className="te-container">
      <h1 className="te-h1">Admin</h1>
      <p className="te-meta" style={{ marginTop: 8 }}>
        Customers in DB:
      </p>
      <ul style={{ marginTop: 12, paddingLeft: 18 }}>
        {customers.map((c) => (
          <li key={c.id}>
            <b>{c.name}</b> — {c.domain}
          </li>
        ))}
      </ul>
      <p className="te-meta" style={{ marginTop: 16 }}>
        This is a thin admin shell; Mission Control is the only control plane.
      </p>
    </main>
  );
}
