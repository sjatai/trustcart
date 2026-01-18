/* eslint-disable no-console */
import "dotenv/config";
import { getOrCreateCustomerByDomain } from "@/lib/customer";

function getArg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return fallback;
}

async function main() {
  const domainOrUrl = getArg("domain") || getArg("url");
  if (!domainOrUrl) {
    throw new Error("Missing --domain <domain-or-url> (or --url <url>)");
  }

  const customer = await getOrCreateCustomerByDomain(domainOrUrl);
  console.log("✅ Customer upserted", { id: customer.id, domain: customer.domain, name: customer.name });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

