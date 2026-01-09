import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export default async function Page() {
  const domain = env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const truthBlocks = customer
    ? await prisma.asset.findMany({
        where: { customerId: customer.id, status: "PUBLISHED", type: "TRUTH_BLOCK" },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : [];

  return (
    <>
      <Hero title="Financing and trade-in steps — explained clearly." />
      <main className="rn-main">
        <div className="rn-container rn-grid2">
          <section className="rn-card">
            <h2 className="rn-cardTitle">Bad credit financing</h2>
            <div className="rn-cardMeta">A practical path to understand options and next steps.</div>
            <ul className="rn-bullets">
              <li>We review budget first, then match lender options.</li>
              <li>Bring proof of income and an ID for fastest turnaround.</li>
              <li>We’ll explain approvals, payments, and total cost.</li>
            </ul>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="rn-ctaPrimary" href="/site/locations">
                Talk to finance
              </Link>
              <Link className="rn-ctaSecondary" href="/site/faq">
                Financing FAQ
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Trade-in value</h2>
            <div className="rn-cardMeta">What affects value and how we make it transparent.</div>
            <ul className="rn-bullets">
              <li>Condition, mileage, market demand, and reconditioning needs.</li>
              <li>Service records reduce uncertainty.</li>
              <li>We explain the factors behind the offer.</li>
            </ul>
            <div style={{ marginTop: 12 }}>
              <Link className="rn-ctaSecondary" href="/site/inventory">
                Browse inventory
              </Link>
            </div>
          </section>
        </div>

        {truthBlocks.length > 0 ? (
          <div className="rn-container" style={{ maxWidth: 980, marginTop: 16 }}>
            <section className="rn-card">
              <h2 className="rn-cardTitle">Truth blocks (published)</h2>
              <div className="rn-muted" style={{ marginTop: 6 }}>
                These blocks appear when Trust Pack assets are approved and published.
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {truthBlocks.map((a) => (
                  <div key={a.id} style={{ border: "1px solid var(--te-border)", borderRadius: 12, padding: 12, background: "#fbfcff" }}>
                    <div style={{ fontWeight: 800 }}>{a.title || a.type}</div>
                    <div className="rn-muted" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {(a.versions?.[0]?.content || "").slice(0, 260)}
                      {(a.versions?.[0]?.content || "").length > 260 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}
