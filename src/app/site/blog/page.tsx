import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { DEMO_BLOG } from "@/lib/siteData";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

function excerptFrom(content: string) {
  const cleaned = content.replace(/^#.+$/gm, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 160) + (cleaned.length > 160 ? "…" : "");
}

export default async function Page() {
  const domain = env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
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
      <Hero title="Helpful guides — designed to remove uncertainty." />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-muted">Published Trust Pack posts appear first, followed by baseline demo posts.</div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {publishedBlogs.map((a) => {
              const content = a.versions?.[0]?.content || "";
              return (
                <article key={a.id} className="rn-card">
                  <h2 className="rn-cardTitle">
                    <Link href={`/site/blog/${a.slug || ""}`} style={{ color: "var(--te-text)", textDecoration: "none" }}>
                      {a.title}
                    </Link>
                  </h2>
                  <div className="rn-cardMeta">Published by Trust Pack</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "rgba(11, 18, 32, 0.82)" }}>{excerptFrom(content)}</div>
                  <div style={{ marginTop: 12 }}>
                    <Link className="rn-ctaSecondary" href={`/site/blog/${a.slug || ""}`}>
                      Read post
                    </Link>
                  </div>
                </article>
              );
            })}
            {DEMO_BLOG.map((p) => (
              <article key={p.slug} className="rn-card">
                <h2 className="rn-cardTitle">
                  <Link href={`/site/blog/${p.slug}`} style={{ color: "var(--te-text)", textDecoration: "none" }}>
                    {p.title}
                  </Link>
                </h2>
                <div className="rn-cardMeta">
                  {p.date} • {p.readingMinutes} min read
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(11, 18, 32, 0.82)" }}>{p.excerpt}</div>
                <div style={{ marginTop: 12 }}>
                  <Link className="rn-ctaSecondary" href={`/site/blog/${p.slug}`}>
                    Read post
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
