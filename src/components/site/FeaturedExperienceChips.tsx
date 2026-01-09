"use client";

import { useState } from "react";
import { FEATURED_EXPERIENCES, intentFromExperience } from "@/lib/siteIntent";
import { trackSiteEvent } from "@/lib/siteEvents";
import { setStoredIntent } from "@/components/site/useSiteIntent";

export function FeaturedExperienceChips({ variant = "hero" }: { variant?: "hero" | "inline" }) {
  const [last, setLast] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function onClick(experience: string) {
    setLast(experience);
    setStoredIntent(intentFromExperience(experience));
    window.dispatchEvent(new CustomEvent("featured-chip-click", { detail: { experience } }));

    setSaving(true);
    try {
      await trackSiteEvent("featured_experience_click", {
        experience,
        surface: "site",
        variant,
        ts: Date.now(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rn-chips" aria-label="Featured experiences">
      {FEATURED_EXPERIENCES.map((x) => (
        <button
          key={x.key}
          type="button"
          className={`rn-chip ${last === x.key ? "rn-chipActive" : ""}`.trim()}
          onClick={() => onClick(x.key)}
          aria-pressed={last === x.key}
        >
          <div className="rn-chipLabel">{x.label}</div>
          <div className="rn-chipDesc">{x.description}</div>
        </button>
      ))}
      {saving ? <div className="rn-chipMeta">Recording event…</div> : <div className="rn-chipMeta">Clicking records a session event.</div>}
    </div>
  );
}


