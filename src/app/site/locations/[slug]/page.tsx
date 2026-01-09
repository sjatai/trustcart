import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { DEMO_LOCATIONS } from "@/lib/siteData";

export default function Page({ params }: { params: { slug: string } }) {
  const loc = DEMO_LOCATIONS.find((l) => l.slug === params.slug);
  if (!loc) {
    return (
      <>
        <Hero title="Location not found." />
        <main className="rn-main">
          <div className="rn-container" style={{ maxWidth: 980 }}>
            <div className="rn-card">
              <h2 className="rn-cardTitle">We couldn’t find that location.</h2>
              <div style={{ marginTop: 12 }}>
                <Link className="rn-ctaSecondary" href="/site/locations">
                  Back to locations
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
      <Hero title={loc.name} />
      <main className="rn-main">
        <div className="rn-container rn-grid2" style={{ maxWidth: 980 }}>
          <section className="rn-card">
            <h2 className="rn-cardTitle">Contact</h2>
            <div className="rn-cardMeta" style={{ marginTop: 8 }}>
              {loc.address}
              <br />
              {loc.city}, {loc.region}
              <br />
              {loc.phone}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="rn-ctaPrimary" href="/site/inventory">
                Schedule test drive
              </Link>
              <Link className="rn-ctaSecondary" href="/site/service">
                Book service
              </Link>
            </div>
          </section>

          <section className="rn-card">
            <h2 className="rn-cardTitle">Hours</h2>
            <ul className="rn-bullets">
              {loc.hours.map((h, idx) => (
                <li key={idx}>{h}</li>
              ))}
            </ul>
            <div className="rn-muted">Demo note: hours will be verified via crawl → claims → evidence (BLOCK 6).</div>
          </section>
        </div>

        <div className="rn-container" style={{ maxWidth: 980, marginTop: 14 }}>
          <Link className="rn-ctaSecondary" href="/site/locations">
            Back to locations
          </Link>
        </div>
      </main>
    </>
  );
}
