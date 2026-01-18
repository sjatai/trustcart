import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { prisma } from "@/lib/db";
import { buildDomainQuery, getSiteDomain } from "@/lib/siteHelpers";

function excerptFrom(content: string) {
  const cleaned = content.replace(/^#.+$/gm, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 160) + (cleaned.length > 160 ? "…" : "");
}

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const domain = getSiteDomain(searchParams);
  const q = buildDomainQuery(domain);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const publishedBlogs = customer
    ? await prisma.asset.findMany({
        where: { customerId: customer.id, status: "PUBLISHED", type: "BLOG" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : [];

  return (
    <>
      <Hero title="Helpful guides — designed to remove uncertainty." domain={domain} />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-muted">Published blog posts for <span className="font-medium">{domain}</span>.</div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {publishedBlogs.map((a) => {
              const content = a.versions?.[0]?.content || "";
              return (
                <article key={a.id} className="rn-card">
                  <h2 className="rn-cardTitle">
                    <Link href={`/site/blog/${a.slug || ""}${q}`} style={{ color: "var(--te-text)", textDecoration: "none" }}>
                      {a.title}
                    </Link>
                  </h2>
                  <div className="rn-cardMeta">Published by Trust Pack</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "rgba(11, 18, 32, 0.82)" }}>{excerptFrom(content)}</div>
                  <div style={{ marginTop: 12 }}>
                    <Link className="rn-ctaSecondary" href={`/site/blog/${a.slug || ""}${q}`}>
                      Read post
                    </Link>
                  </div>
                </article>
              );
            })}
            {customer && publishedBlogs.length === 0 ? (
              <article className="rn-card">
                <h2 className="rn-cardTitle">No published blog posts yet</h2>
                <div className="rn-cardMeta" style={{ marginTop: 8 }}>
                  Generate a blog draft from Recommendations, then Approve & Publish to make it appear here.
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
