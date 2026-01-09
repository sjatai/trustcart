import "./site.css";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rn-root">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
