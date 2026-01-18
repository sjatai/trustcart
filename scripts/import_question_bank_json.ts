/* eslint-disable no-console */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

type BankJson = {
  industry: string;
  geo: string;
  language: string;
  persona: string;
  questions: Array<{ taxonomy: string; weight: number; text: string }>;
};

function getArg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return fallback;
}

async function main() {
  const file = getArg("file");
  if (!file) throw new Error("Missing --file <path-to-json>");

  const full = path.resolve(process.cwd(), file);
  const raw = fs.readFileSync(full, "utf8");
  const bank = JSON.parse(raw) as BankJson;

  const intentDomain = await prisma.intentDomain.upsert({
    where: {
      industry_geo_language_persona: {
        industry: bank.industry,
        geo: bank.geo,
        language: bank.language,
        persona: bank.persona,
      },
    } as any,
    update: {},
    create: {
      industry: bank.industry,
      geo: bank.geo,
      language: bank.language,
      persona: bank.persona,
    } as any,
  });

  let upserted = 0;

  for (const q of bank.questions) {
    await prisma.questionBankEntry.upsert({
      where: {
        intentDomainId_questionText: {
          intentDomainId: intentDomain.id,
          questionText: q.text,
        },
      } as any,
      update: { taxonomy: q.taxonomy as any, weight: q.weight },
      create: {
        intentDomainId: intentDomain.id,
        questionText: q.text,
        taxonomy: q.taxonomy as any,
        weight: q.weight,
      } as any,
    });
    upserted += 1;
  }

  console.log(
    `✅ Imported bank: ${bank.industry}/${bank.geo}/${bank.language}/${bank.persona} (${upserted} questions)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});