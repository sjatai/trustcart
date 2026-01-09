import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { DEMO_LOCATIONS } from "@/lib/siteData";

export default function Page() {
  return (
    <>
      <Hero title="Locations and hours." />
      <main className="rn-main">
        <div className="rn-container" style={{ maxWidth: 980 }}>
          <div className="rn-muted">Choose a location for address, phone, and hours.</div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {DEMO_LOCATIONS.map((l) => (
              <section key={l.slug} className="rn-card">
                <h2 className="rn-cardTitle">
                  <Link href={`/site/locations/${l.slug}`} style={{ color: "var(--te-text)", textDecoration: "none" }}>
                    {l.name}
                  </Link>
                </h2>
                <div className="rn-cardMeta">
                  {l.address}, {l.city}, {l.region} • {l.phone}
                </div>
                <div className="rn-muted" style={{ marginTop: 8 }}>
                  {l.hours.join(" • ")}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Link className="rn-ctaSecondary" href={`/site/locations/${l.slug}`}>
                    View details
                  </Link>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
