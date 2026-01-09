export type TrustZone = "UNSAFE" | "CAUTION" | "READY" | "ADVOCACY";

export function trustZone(total: number): TrustZone {
  if (total <= 40) return "UNSAFE";
  if (total <= 65) return "CAUTION";
  if (total <= 80) return "READY";
  return "ADVOCACY";
}

export function allowedActionsForTrust(total: number) {
  const zone = trustZone(total);
  if (zone === "UNSAFE") {
    return {
      zone,
      allowed: ["crawl", "build_knowledge", "generate_drafts"],
      blocked: ["publish", "campaigns", "automated_outreach"],
    };
  }
  if (zone === "CAUTION") {
    return {
      zone,
      allowed: ["crawl", "build_knowledge", "generate_drafts", "publish_with_approval", "campaigns_dry_run"],
      blocked: ["campaigns_send"],
    };
  }
  if (zone === "READY") {
    return {
      zone,
      allowed: ["crawl", "build_knowledge", "generate_drafts", "publish_with_approval", "campaigns_dry_run", "campaigns_send_limited"],
      blocked: ["aggressive_upsell_segments"],
    };
  }
  return {
    zone,
    allowed: ["crawl", "build_knowledge", "generate_drafts", "publish_with_approval", "campaigns_send"],
    blocked: [],
  };
}


