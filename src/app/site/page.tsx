import Link from "next/link";
import { Hero } from "@/components/site/Hero";

export default function SiteHome() {
  return (
    <>
      <Hero />
      <main className="rn-main">
        <div className="rn-container rn-grid2">
          <section className="rn-card">
            <h2 className="rn-cardTitle">Inventory highlights</h2>
            <div className="rn-cardMeta">Browse a curated set of new and used vehicles.</div>
            <div style={{ marginTop: 12 }}>
              <Link className="rn-ctaSecondary" href="/site/inventory">
                View inventory
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Service & maintenance</h2>
            <div className="rn-cardMeta">Oil changes, brakes, tires, inspections — with clear explanations.</div>
            <div style={{ marginTop: 12 }}>
              <Link className="rn-ctaSecondary" href="/site/service">
                Book service
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Financing that fits</h2>
            <div className="rn-cardMeta">Explore pre-approval, bad credit options, and trade-in steps.</div>
            <div style={{ marginTop: 12 }}>
              <Link className="rn-ctaSecondary" href="/site/finance">
                Explore financing
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Answers you can trust</h2>
            <div className="rn-cardMeta">FAQ and blog posts designed to remove demand-blocking uncertainty.</div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="rn-ctaSecondary" href="/site/faq">
                Read FAQ
              </Link>
              <Link className="rn-ctaSecondary" href="/site/blog">
                Read blog
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
