import { Hero } from "@/components/site/Hero";
import { prisma } from "@/lib/db";
import { getDomainFromSearchParams } from "@/lib/domain";

function parseFaq(content: string): { q: string; a: string } | null {
  const q = content.match(/Q:\s*(.+)/i)?.[1]?.trim();
  const a = content.match(/A:\s*([\s\S]+)/i)?.[1]?.trim();
  if (!q || !a) return null;
  return { q, a };
}

export const dynamic = "force-dynamic";

type FaqPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function FaqPage({ searchParams }: FaqPageProps = {}) {
  const domain = getDomainFromSearchParams(searchParams);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const publishedFaqAssets = customer
    ? await prisma.asset.findMany({
        where: { customerId: customer.id, status: "PUBLISHED", type: "FAQ" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : [];

  const publishedFaq = publishedFaqAssets
    .map((a) => parseFaq(a.versions?.[0]?.content || ""))
    .filter((x): x is { q: string; a: string } => Boolean(x));

  return (
    <>
      <Hero title={`FAQ — ${domain} answers, fewer surprises.`} domain={domain} />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-muted">Published FAQs for <span className="font-medium">{domain}</span>.</div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {publishedFaq.map((f, idx) => (
              <section key={`p_${idx}`} className="rn-card">
                <h2 className="rn-cardTitle">{f.q}</h2>
                <div className="rn-cardMeta" style={{ marginTop: 8, fontSize: 13, color: "rgba(11, 18, 32, 0.82)" }}>
                  {f.a}
                </div>
                <div className="rn-muted" style={{ marginTop: 10 }}>
                  Published by Trust Pack
                </div>
              </section>
            ))}
            {customer && publishedFaq.length === 0 ? (
              <section className="rn-card">
                <h2 className="rn-cardTitle">No published FAQs yet</h2>
                <div className="rn-cardMeta" style={{ marginTop: 8 }}>
                  Generate a draft from Recommendations, then Approve & Publish to make it appear here.
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
