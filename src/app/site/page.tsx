import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { buildDomainQuery, getSiteDomain } from "@/lib/siteHelpers";
import { prisma } from "@/lib/db";

export default function SiteHome({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const domain = getSiteDomain(searchParams);
  const q = buildDomainQuery(domain);
  return (
    <>
      <Hero title={domain} domain={domain} />
      <main className="rn-main">
        <HomeBody domain={domain} q={q} />
      </main>
    </>
  );
}

async function HomeBody({ domain, q }: { domain: string; q: string }) {
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) {
    return (
      <div className="rn-container" style={{ maxWidth: 980 }}>
        <div className="rn-card">
          <div className="rn-cardTitle">Unknown domain</div>
          <div className="rn-cardMeta" style={{ marginTop: 8 }}>
            No Customer row exists for <b>{domain}</b>.
          </div>
        </div>
      </div>
    );
  }

  const claims = await prisma.claim.findMany({
    where: { customerId: customer.id },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: 80,
    include: { evidence: { take: 2, orderBy: { capturedAt: "desc" } } },
  });

  const pick = (keys: string[]) => claims.find((c) => keys.includes(c.key));
  const phone = pick(["contact.phone", "location.phone"]);
  const address = pick(["location.address"]);
  const hours = claims.find((c) => c.key.startsWith("hours."));
  const hasProducts = (await prisma.product.count({ where: { customerId: customer.id } })) > 0;
  const products = hasProducts
    ? await prisma.product.findMany({
        where: { customerId: customer.id },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { handle: true, title: true, priceMin: true, priceMax: true, currency: true },
      })
    : [];

  const factRow = (label: string, c?: typeof claims[number]) => {
    if (!c) return null;
    const ev = c.evidence?.[0];
    return (
      <div className="rn-cardMeta" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span className="rn-pill">{label}</span> <span style={{ marginLeft: 6 }}>{c.value}</span>
        </div>
        {ev?.url ? (
          <a className="te-link" href={ev.url} target="_blank" rel="noreferrer" title={ev.url}>
            proof
          </a>
        ) : null}
      </div>
    );
  };

  return (
    <div className="rn-container rn-grid2">
      <section className="rn-card">
        <h2 className="rn-cardTitle">Verified facts</h2>
        <div className="rn-cardMeta" style={{ marginTop: 8 }}>
          Claims for <b>{customer.name}</b> (<span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{domain}</span>)
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {factRow("Phone", phone)}
          {factRow("Address", address)}
          {factRow(hours ? hours.key.replace(/^hours\\./, "Hours ") : "Hours", hours || undefined)}
          {!phone && !address && !hours ? (
            <div className="rn-cardMeta">No verified facts yet. Run “Onboard {domain}”.</div>
          ) : null}
        </div>
      </section>

      <section className="rn-card">
        <h2 className="rn-cardTitle">Experience surfaces</h2>
        <div className="rn-cardMeta" style={{ marginTop: 8 }}>
          These pages render published Assets and Products for this domain.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="rn-ctaSecondary" href={`/site/faq${q}`}>
            FAQ
          </Link>
          <Link className="rn-ctaSecondary" href={`/site/blog${q}`}>
            Blog
          </Link>
          {hasProducts ? (
            <Link className="rn-ctaSecondary" href={`/site/products${q}`}>
              Products
            </Link>
          ) : null}
        </div>
      </section>

      {hasProducts ? (
        <section className="rn-card">
          <h2 className="rn-cardTitle">Products</h2>
          <div className="rn-cardMeta">Latest products in the catalog for this domain.</div>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {products.map((p) => (
              <div key={p.handle} className="rn-cardMeta" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--te-text)" }}>{p.title}</div>
                  <div style={{ opacity: 0.8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{p.handle}</div>
                </div>
                <Link className="rn-ctaSecondary" href={`/site/products/${p.handle}${q}`}>
                  View
                </Link>
              </div>
            ))}
            <div>
              <Link className="rn-ctaSecondary" href={`/site/products${q}`}>
                View all products
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rn-card">
          <h2 className="rn-cardTitle">Products</h2>
          <div className="rn-cardMeta">No products exist for this domain yet.</div>
          <div style={{ marginTop: 12 }}>
            <span className="rn-muted">Seed or import products, then reload.</span>
          </div>
        </section>
      )}

      <section className="rn-card">
        <h2 className="rn-cardTitle">Answers you can trust</h2>
        <div className="rn-cardMeta">FAQ and blog posts designed to remove demand-blocking uncertainty.</div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="rn-ctaSecondary" href={`/site/faq${q}`}>
            Read FAQ
          </Link>
          <Link className="rn-ctaSecondary" href={`/site/blog${q}`}>
            Read blog
          </Link>
        </div>
      </section>
    </div>
  );
}
