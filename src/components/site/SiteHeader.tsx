import Link from "next/link";
import { buildDomainQuery } from "@/lib/siteHelpers";

export function SiteHeader({
  domain,
  customerName,
}: {
  domain?: string;
  customerName?: string;
  showProducts?: boolean; // kept for backward-compat but unused in SunnyStep demo nav
}) {
  const q = buildDomainQuery(domain);
  const brand = (customerName || domain || "Demo").trim();
  return (
    <header className="rn-header">
      <div className="rn-container rn-headerRow">
        <div className="rn-brand">
          <Link href={`/site${q}`} className="rn-brandName">
            {brand}
          </Link>
          <div className="rn-brandMeta">
            Demo mirror • <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{domain}</span>
          </div>
        </div>

        <nav className="rn-nav" aria-label="Site navigation">
          <Link href={`/site/products${q}`}>Products</Link>
          <Link href={`/site/faq${q}`}>FAQ</Link>
          <Link href={`/site/blog${q}`}>Blog</Link>
        </nav>
      </div>
    </header>
  );
}


