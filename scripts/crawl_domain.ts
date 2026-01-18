/* eslint-disable no-console */
import "dotenv/config";
import { getCustomerByDomain } from "@/lib/domain";
import { crawlDomain } from "@/lib/crawler";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const domain = String(arg("domain") || process.env.TRUSTEYE_DOMAIN || "sunnysteps.com").trim();
  const maxPages = Number(arg("maxPages") || process.env.TRUSTEYE_ONBOARD_MAX_PAGES || "120");
  const customer = await getCustomerByDomain(domain);
  console.log("[crawl_domain]", { domain, customerId: customer.id, maxPages });
  const res = await crawlDomain({ customerId: customer.id, domain, maxPages });
  console.log("✅ crawl complete", res);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

