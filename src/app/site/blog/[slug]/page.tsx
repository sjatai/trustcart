import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { prisma } from "@/lib/db";
import { buildDomainQuery, getSiteDomain } from "@/lib/siteHelpers";

function renderParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith("# "))
    .slice(0, 12);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const domain = getSiteDomain(searchParams);
  const q = buildDomainQuery(domain);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const published = customer
    ? await prisma.asset.findFirst({
        where: { customerId: customer.id, status: "PUBLISHED", type: "BLOG", slug: params.slug },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : null;

  if (published) {
    const content = published.versions?.[0]?.content || "";
    const paragraphs = renderParagraphs(content);
    return (
      <>
        <Hero title={published.title || "Blog"} domain={domain} />
        <main className="rn-main">
          <div className="rn-container" style={{ maxWidth: 980 }}>
            <div className="rn-muted">Published by Trust Pack</div>

            <article className="rn-card" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, color: "rgba(11, 18, 32, 0.84)" }}>
                {paragraphs.map((p, idx) => (
                  <p key={idx} style={{ marginTop: idx === 0 ? 0 : 12 }}>
                    {p}
                  </p>
                ))}
              </div>
            </article>

            <div style={{ marginTop: 14 }}>
              <Link className="rn-ctaSecondary" href={`/site/blog${q}`}>
                Back to blog
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <Hero title="Post not found." domain={domain} />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-card">
            <h2 className="rn-cardTitle">We couldn’t find that post.</h2>
            <div className="rn-cardMeta" style={{ marginTop: 8 }}>
              This demo only renders DB-published blog assets for the selected domain.
            </div>
            <div style={{ marginTop: 12 }}>
              <Link className="rn-ctaSecondary" href={`/site/blog${q}`}>
                Back to blog
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
