import Link from "next/link";
import { FeaturedExperienceChips } from "@/components/site/FeaturedExperienceChips";

export function SiteHeader() {
  return (
    <header className="rn-header">
      <div className="rn-container rn-headerRow">
        <div className="rn-brand">
          <Link href="/site" className="rn-brandName">
            Reliable Nissan
          </Link>
          <div className="rn-brandMeta">Demo mirror • Albuquerque, NM</div>
        </div>

        <nav className="rn-nav" aria-label="Site navigation">
          <Link href="/site/inventory">Inventory</Link>
          <Link href="/site/service">Service</Link>
          <Link href="/site/finance">Finance</Link>
          <Link href="/site/locations">Locations</Link>
          <Link href="/site/faq">FAQ</Link>
          <Link href="/site/blog">Blog</Link>
        </nav>
      </div>

      <div className="rn-container" style={{ marginTop: 12 }}>
        <FeaturedExperienceChips variant="inline" />
      </div>
    </header>
  );
}


