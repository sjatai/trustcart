import "./site.css";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { prisma } from "@/lib/db";
import { getSiteDomain } from "@/lib/siteHelpers";

type SiteLayoutProps = {
  children: React.ReactNode;
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function SiteLayout({ children, searchParams }: SiteLayoutProps) {
  const domain = getSiteDomain(searchParams);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) {
    return (
      <div className="rn-root">
        <SiteHeader domain={domain} customerName={domain} showProducts={false} />
        <main className="rn-main">
          <div className="rn-container" style={{ maxWidth: 980 }}>
            <div className="rn-card">
              <div className="rn-cardTitle">Unknown domain</div>
              <div className="rn-cardMeta" style={{ marginTop: 8 }}>
                No Customer row exists for <b>{domain}</b>. Create it in DB (seed or customer:add) and retry.
              </div>
            </div>
          </div>
        </main>
        <SiteFooter domain={domain} customerName={domain} showProducts={false} />
      </div>
    );
  }
  const productCount = customer
    ? await prisma.product.count({
        where: { customerId: customer.id },
      })
    : 0;

  return (
    <div className="rn-root">
      <SiteHeader domain={domain} customerName={customer.name} showProducts={productCount > 0} />
      {children}
      <SiteFooter domain={domain} customerName={customer.name} showProducts={productCount > 0} />
    </div>
  );
}
