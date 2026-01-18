import Link from "next/link";

import { prisma } from "@/lib/db";
import { getSiteDomain, buildDomainQuery } from "@/lib/siteHelpers";

type ProductDetailProps = {
  params: { handle: string };
  searchParams: Record<string, string | string[] | undefined>;
};

function judgementBadge(patchStatus?: string) {
  if (patchStatus === "DRAFT") return "Draft pending approval";
  if (patchStatus === "PUBLISHED") return "Verified";
  return null;
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailProps) {
  const domain = getSiteDomain(searchParams);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) {
    return <div className="rn-main">Customer not found</div>;
  }

  const product = await prisma.product.findFirst({
    where: { customerId: customer.id, handle: params.handle },
    include: {
      patches: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
    },
  });

  if (!product) {
    return (
      <div className="rn-main">
        <div className="rn-container">
          <div className="rn-card">
            <div className="rn-cardTitle">Product not found.</div>
            <Link href={`/site/products${buildDomainQuery(domain)}`} className="rn-ctaSecondary" style={{ marginTop: 12 }}>
              Back to products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const publishedPatch = product.patches.find((p) => p.status === "PUBLISHED");
  const draftPatch = product.patches.find((p) => p.status === "DRAFT");
  const priceRange =
    product.priceMin && product.priceMax
      ? product.priceMin === product.priceMax
        ? `${product.currency} ${product.priceMin / 100}`
        : `${product.currency} ${product.priceMin / 100}–${product.currency} ${product.priceMax / 100}`
      : product.priceMin
      ? `${product.currency} ${product.priceMin / 100}+`
      : "Price on request";

  return (
    <main className="rn-main">
      <div className="rn-container" style={{ maxWidth: 980 }}>
        <div className="rn-pageHeader">
          <div>
            <h1 className="rn-cardTitle">{product.title}</h1>
            <div className="rn-cardMeta">
              {product.vendor} · {product.productType} · {priceRange}
            </div>
          </div>
          <Link href={`/site/products${buildDomainQuery(domain)}`} className="rn-ctaSecondary">
            Back to products
          </Link>
        </div>

        <article className="rn-card" style={{ marginTop: 16 }}>
          <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml || "" }} />
          {product.specs ? (
            <div style={{ marginTop: 12 }}>
              <h2 className="rn-cardTitle" style={{ fontSize: 18 }}>
                Specs
              </h2>
              <pre className="rn-cardMeta">{JSON.stringify(product.specs, null, 2)}</pre>
            </div>
          ) : null}
        </article>

        {publishedPatch ? (
          <article className="rn-card" style={{ marginTop: 16 }}>
            <div className="rn-cardTitle" style={{ fontSize: 18 }}>
              Verified details
            </div>
            <div className="rn-cardMeta">{judgementBadge(publishedPatch.status)}</div>
            <p className="rn-cardBody">{publishedPatch.bodyMd}</p>
          </article>
        ) : (
          <div className="rn-card" style={{ marginTop: 16 }}>
            <div className="rn-cardTitle" style={{ fontSize: 18 }}>
              Verified details
            </div>
            <div className="rn-cardMeta text-[var(--te-muted)]">No published patch yet.</div>
          </div>
        )}

        {draftPatch && searchParams.presentation === "true" ? (
          <div className="rounded-2xl border border-[var(--te-border)] bg-[var(--te-surface)] px-4 py-3 mt-6">
            <div className="text-[13px] font-semibold text-[var(--te-text)]">Draft pending approval</div>
            <p className="text-[12px] text-[var(--te-muted)] mt-1">{draftPatch.bodyMd}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
