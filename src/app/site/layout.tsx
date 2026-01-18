import "./site.css";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { env } from "@/lib/env";
import { normalizeDemoDomain } from "@/lib/domain";

type SiteLayoutProps = {
  children: React.ReactNode;
};

export default function SiteLayout({ children }: SiteLayoutProps) {
  // Layouts do not receive `searchParams` in the App Router; pages do.
  // Use the demo domain as a stable fallback for the global chrome.
  const domain = normalizeDemoDomain(env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com") || "sunnystep.com";

  return (
    <div className="rn-root">
      <SiteHeader domain={domain} customerName={domain} />
      {children}
      <SiteFooter domain={domain} customerName={domain} showProducts={true} />
    </div>
  );
}
