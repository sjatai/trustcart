import Link from "next/link";

import { prisma } from "@/lib/db";
import { getSiteDomain, buildDomainQuery } from "@/lib/siteHelpers";

type ProductsPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

function formatPriceRange(priceMin?: number | null, priceMax?: number | null, currency = "USD") {
  if (priceMin && priceMax && priceMin === priceMax) {
    return `${currency} ${priceMin / 100}`;
  }
  if (priceMin && priceMax) {
    return `${currency} ${priceMin / 100}–${currency} ${priceMax / 100}`;
  }
  if (priceMin) {
    return `${currency} ${priceMin / 100}+`;
  }
  return "Price on request";
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const domain = getSiteDomain(searchParams);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) {
    return <div className="rn-main">Unknown domain: {domain}</div>;
  }

  const products = await prisma.product.findMany({
    where: { customerId: customer.id },
    orderBy: { updatedAt: "desc" },
    include: {
      patches: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
    },
  });

  return (
    <main className="rn-main">
      <div className="rn-container" style={{ maxWidth: 980 }}>
        <div className="rn-pageHeader">
          <h1 className="rn-cardTitle">
            Products for {customer.name}{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, fontSize: 14, opacity: 0.8 }}>
              ({customer.domain})
            </span>
          </h1>
          <p className="rn-cardMeta">
            Spot verified details and patch history for each product. Use Mission Control to push
            updates instantly.
          </p>
        </div>

        <div className="rn-grid3" style={{ marginTop: 20 }}>
          {products.map((product) => {
            const publishedPatch = product.patches.find((p) => p.status === "PUBLISHED");
            const latestDraft = product.patches.find((p) => p.status === "DRAFT");
            return (
              <article key={product.id} className="rn-card">
                <div className="rn-cardTitle" style={{ marginTop: 0 }}>
                  {product.title}
                </div>
                <div className="rn-cardMeta">
                  {product.vendor} · {product.productType}
                </div>
                <div className="rn-cardMeta">{formatPriceRange(product.priceMin, product.priceMax, product.currency || "USD")}</div>
                <div
                  className="rn-cardBody"
                  style={{ marginTop: 12 }}
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml || "" }}
                />
                {publishedPatch ? (
                  <div className="rn-cardSection">
                    <div className="rn-cardLabel">Verified details</div>
                    <p className="rn-cardMeta line-clamp-3">{publishedPatch.bodyMd}</p>
                  </div>
                ) : (
                  <div className="rn-cardSection">
                    <div className="rn-cardLabel">Verified details</div>
                    <p className="rn-cardMeta text-[var(--te-muted)]">No published patch yet.</p>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <Link
                    href={`/site/products/${product.handle}${buildDomainQuery(domain)}`}
                    className="rn-ctaSecondary"
                  >
                    View product page
                  </Link>
                </div>
                {latestDraft ? (
                  <div className="rn-cardSection" style={{ marginTop: 12 }}>
                    <p className="rn-cardMeta text-[var(--te-muted)]">Draft pending approval</p>
                  </div>
                ) : null}
              </article>
            );
          })}
          {products.length === 0 ? (
            <div className="rn-card">
              <div className="rn-cardTitle">No products yet</div>
              <p className="rn-cardMeta">Publish a product patch recommendation to get started.</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
