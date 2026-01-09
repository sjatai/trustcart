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
      <Hero title="Service you can trust — with clear explanations." />
      <main className="rn-main">
        <div className="rn-container rn-grid2">
          <section className="rn-card">
            <h2 className="rn-cardTitle">Popular services</h2>
            <ul className="rn-bullets">
              <li>Oil change & multipoint inspection</li>
              <li>Brakes (pads/rotors) & safety checks</li>
              <li>Tires, alignment & balancing</li>
              <li>Battery & electrical diagnostics</li>
            </ul>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="rn-ctaPrimary" href="/site/locations/service-center">
                Book service
              </Link>
              <Link className="rn-ctaSecondary" href="/site/faq">
                Service FAQ
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Service specials</h2>
            <div className="rn-cardMeta">Demo-friendly offers (used as “truth blocks” later).</div>
            <ul className="rn-bullets">
              <li>Oil change package (synthetic) — limited time</li>
              <li>Brake inspection + savings on pads</li>
              <li>Winter check: battery + tire tread review</li>
            </ul>
            <div className="rn-muted">Offers shown here are placeholders until Trust Pack publishing (BLOCK 9).</div>
          </section>
        </div>

        {truthBlocks.length > 0 ? (
          <div className="rn-container" style={{ maxWidth: 980, marginTop: 16 }}>
            <section className="rn-card">
              <h2 className="rn-cardTitle">Truth blocks (published)</h2>
              <div className="rn-muted" style={{ marginTop: 6 }}>
                Live content published by Trust Pack appears here.
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
