"use client";

import Link from "next/link";
import { useSiteIntent } from "@/components/site/useSiteIntent";
import { heroForIntent } from "@/lib/siteIntent";

export function Hero({ title }: { title?: string }) {
  const intent = useSiteIntent();
  const hero = heroForIntent(intent);
  const headline = title || hero.headline;

  return (
    <section className="rn-hero">
      <div className="rn-container rn-heroGrid">
        <div>
          <h1 className="rn-h1">{headline}</h1>
          <p className="rn-lead">{hero.subhead}</p>
          <div className="rn-ctaRow">
            <Link className="rn-ctaPrimary" href={hero.primaryCta.href}>
              {hero.primaryCta.label}
            </Link>
            <Link className="rn-ctaSecondary" href={hero.secondaryCta.href}>
              {hero.secondaryCta.label}
            </Link>
          </div>
          <div className="rn-muted" style={{ marginTop: 12 }}>
            Inferred intent: <b style={{ color: "var(--te-text)" }}>{intent}</b>
          </div>
        </div>

        <div className="rn-heroCard">
          <div style={{ fontWeight: 700 }}>Why customers choose us</div>
          <ul className="rn-bullets">
            <li>Clear pricing and no-pressure appointments</li>
            <li>Service team that explains what changed and why</li>
            <li>Financing paths built around your budget</li>
          </ul>
          <div className="rn-muted">Demo note: this page adapts based on “Featured Experience” clicks.</div>
        </div>
      </div>
    </section>
  );
}


