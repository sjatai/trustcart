import Link from "next/link";
import { DEMO_INVENTORY } from "@/lib/siteData";
import { Hero } from "@/components/site/Hero";

export default function Page() {
  return (
    <>
      <Hero title="Inventory you can browse confidently." />
      <main className="rn-main">
        <div className="rn-container">
          <div className="rn-muted">
            Demo note: inventory is a stable snapshot for presentation. “Schedule test drive” is a CTA (publishing comes in later blocks).
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            {DEMO_INVENTORY.map((v) => (
              <article key={v.id} className="rn-card">
                <h2 className="rn-cardTitle">
                  {v.year} {v.make} {v.model} <span style={{ opacity: 0.7 }}>{v.trim}</span>
                </h2>
                <div className="rn-cardMeta" style={{ marginTop: 8 }}>
                  <b style={{ color: "var(--te-text)" }}>${v.price.toLocaleString()}</b> • {v.miles.toLocaleString()} miles • {v.tag}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link className="rn-ctaPrimary" href="/site/locations">
                    Schedule test drive
                  </Link>
                  <Link className="rn-ctaSecondary" href="/site/finance">
                    Explore financing
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
