import Link from "next/link";
import { redirect } from "next/navigation";
import { Hero } from "@/components/site/Hero";
import { buildDomainQuery, getSiteDomain } from "@/lib/siteHelpers";

export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const domain = getSiteDomain(searchParams);
  const q = buildDomainQuery(domain);
  redirect(`/site/products${q}`);
  return (
    <>
      <Hero title="This section is not part of the SunnyStep demo." domain={domain} />
      <main className="rn-main">
        <div className="rn-container">
          <div className="rn-card" style={{ maxWidth: 980 }}>
            <h2 className="rn-cardTitle">Go to the SunnyStep demo surfaces</h2>
            <div className="rn-muted" style={{ marginTop: 8 }}>
              This TrustEye demo focuses on generating and publishing verified content (FAQ/Blog/Products) for {domain}.
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="rn-ctaPrimary" href={`/site/products${q}`}>
                Products
              </Link>
              <Link className="rn-ctaSecondary" href={`/site/faq${q}`}>
                FAQ
              </Link>
              <Link className="rn-ctaSecondary" href={`/site/blog${q}`}>
                Blog
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
