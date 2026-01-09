import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="rn-footer">
      <div className="rn-container rn-footerGrid">
        <div>
          <div style={{ fontWeight: 700 }}>Reliable Nissan</div>
          <div className="rn-muted" style={{ marginTop: 6 }}>
            This is a stable demo mirror for the TrustEye presentation.
          </div>
        </div>
        <div className="rn-footerLinks">
          <Link href="/site/inventory">Inventory</Link>
          <Link href="/site/service">Service</Link>
          <Link href="/site/finance">Finance</Link>
          <Link href="/site/locations">Locations</Link>
        </div>
        <div className="rn-muted">
          <div>Hours may vary by department.</div>
          <div style={{ marginTop: 6 }}>Call before visiting: (505) 000-0000</div>
        </div>
      </div>
    </footer>
  );
}


