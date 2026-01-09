export type PrimaryIntent =
  | "trade_in_value"
  | "bad_credit_financing"
  | "service_specials"
  | "test_drive"
  | "unknown";

export type FeaturedExperience = Exclude<PrimaryIntent, "unknown">;

export const FEATURED_EXPERIENCES: { key: FeaturedExperience; label: string; description: string }[] = [
  { key: "trade_in_value", label: "Trade-in value", description: "Get a quick estimate and next steps" },
  { key: "bad_credit_financing", label: "Bad credit financing", description: "Explore options that fit your budget" },
  { key: "service_specials", label: "Service specials", description: "See current offers and book service" },
  { key: "test_drive", label: "Test drive", description: "Schedule a drive in minutes" },
];

export function heroForIntent(intent: PrimaryIntent) {
  if (intent === "trade_in_value") {
    return {
      headline: "Know your trade-in value — fast, transparent, no pressure.",
      subhead: "Bring your VIN and a few details. We’ll explain the number and your best next step.",
      primaryCta: { label: "Check trade-in value", href: "/site/finance" },
      secondaryCta: { label: "Browse inventory", href: "/site/inventory" },
    };
  }
  if (intent === "bad_credit_financing") {
    return {
      headline: "Financing options that meet you where you are.",
      subhead: "Bad credit doesn’t automatically mean no options. We’ll review realistic paths and confirm next steps.",
      primaryCta: { label: "Explore financing options", href: "/site/finance" },
      secondaryCta: { label: "Talk to a specialist", href: "/site/locations" },
    };
  }
  if (intent === "service_specials") {
    return {
      headline: "Keep your Nissan running great — and save with service specials.",
      subhead: "View current offers, book an appointment, and get reminders when it’s time for maintenance.",
      primaryCta: { label: "View service specials", href: "/site/service" },
      secondaryCta: { label: "Find service hours", href: "/site/locations/service-center" },
    };
  }
  if (intent === "test_drive") {
    return {
      headline: "Schedule a test drive in minutes.",
      subhead: "Pick a model, pick a time, and we’ll confirm quickly — no pressure, no games.",
      primaryCta: { label: "Schedule test drive", href: "/site/inventory" },
      secondaryCta: { label: "See locations", href: "/site/locations" },
    };
  }
  return {
    headline: "Reliable Nissan — vehicles, service, and financing you can trust.",
    subhead: "This is a stable demo mirror used in the TrustEye presentation. Explore inventory, service, and financing.",
    primaryCta: { label: "Browse inventory", href: "/site/inventory" },
    secondaryCta: { label: "Explore financing", href: "/site/finance" },
  };
}

export function intentFromExperience(experience?: string): PrimaryIntent {
  if (!experience) return "unknown";
  const x = String(experience);
  if (x === "trade_in_value") return "trade_in_value";
  if (x === "bad_credit_financing") return "bad_credit_financing";
  if (x === "service_specials") return "service_specials";
  if (x === "test_drive") return "test_drive";
  return "unknown";
}


