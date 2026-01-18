import Link from "next/link";
import { buildDomainQuery } from "@/lib/siteHelpers";

export function SiteFooter({
  domain,
  customerName,
  showProducts,
}: {
  domain: string;
  customerName: string;
  showProducts: boolean;
}) {
  const q = buildDomainQuery(domain);
  return (
    <footer className="rn-footer">
      <div className="rn-container rn-footerGrid">
        <div>
          <div style={{ fontWeight: 700 }}>{customerName}</div>
          <div className="rn-muted" style={{ marginTop: 6 }}>
            This is a stable demo mirror for the TrustEye presentation ({domain}).
          </div>
        </div>
        <div className="rn-footerLinks">
          {showProducts ? (
            <>
              <Link href={`/site/products${q}`}>Products</Link>
              <Link href={`/site/faq${q}`}>FAQ</Link>
              <Link href={`/site/blog${q}`}>Blog</Link>
            </>
          ) : (
            <>
              <Link href={`/site/faq${q}`}>FAQ</Link>
              <Link href={`/site/blog${q}`}>Blog</Link>
            </>
          )}
        </div>
        <div className="rn-muted">
          <div>All content is domain-scoped and written with receipts.</div>
          <div style={{ marginTop: 6 }}>Demo domain: {domain}</div>
        </div>
      </div>
    </footer>
  );
}


