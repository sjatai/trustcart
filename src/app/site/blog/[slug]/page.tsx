import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { DEMO_BLOG } from "@/lib/siteData";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

function renderParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith("# "))
    .slice(0, 12);
}

export default async function Page({ params }: { params: { slug: string } }) {
  const domain = env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
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
        <Hero title={published.title || "Blog"} />
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
              <Link className="rn-ctaSecondary" href="/site/blog">
                Back to blog
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const post = DEMO_BLOG.find((p) => p.slug === params.slug);
  if (!post) {
    return (
      <>
        <Hero title="Post not found." />
        <main className="rn-main">
          <div className="rn-container" style={{ maxWidth: 980 }}>
            <div className="rn-card">
              <h2 className="rn-cardTitle">We couldn’t find that post.</h2>
              <div className="rn-cardMeta" style={{ marginTop: 8 }}>
                Return to the blog list.
              </div>
              <div style={{ marginTop: 12 }}>
                <Link className="rn-ctaSecondary" href="/site/blog">
                  Back to blog
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Hero title={post.title} />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-muted">
            {post.date} • {post.readingMinutes} min read
          </div>

          <article className="rn-card" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, color: "rgba(11, 18, 32, 0.84)" }}>
              {post.body.map((p, idx) => (
                <p key={idx} style={{ marginTop: idx === 0 ? 0 : 12 }}>
                  {p}
                </p>
              ))}
            </div>
          </article>

          <div style={{ marginTop: 14 }}>
            <Link className="rn-ctaSecondary" href="/site/blog">
              Back to blog
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
