/*
  Warnings:

  - The `recommendedAssetType` column on the `ContentRecommendation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ContentRecommendation" DROP COLUMN "recommendedAssetType",
ADD COLUMN     "recommendedAssetType" "AssetType" NOT NULL DEFAULT 'FAQ',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "IntentDomain" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "geo" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "persona" TEXT NOT NULL DEFAULT 'consumer',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntentDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankEntry" (
    "id" TEXT NOT NULL,
    "intentDomainId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "taxonomy" "QuestionTaxonomy" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "sourceMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSignalSnapshot" (
    "id" TEXT NOT NULL,
    "intentDomainId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "deltaWeight" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionSignalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentDomain_industry_geo_idx" ON "IntentDomain"("industry", "geo");

-- CreateIndex
CREATE UNIQUE INDEX "IntentDomain_industry_geo_language_persona_key" ON "IntentDomain"("industry", "geo", "language", "persona");

-- CreateIndex
CREATE INDEX "QuestionBankEntry_intentDomainId_weight_idx" ON "QuestionBankEntry"("intentDomainId", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankEntry_intentDomainId_questionText_key" ON "QuestionBankEntry"("intentDomainId", "questionText");

-- CreateIndex
CREATE INDEX "QuestionSignalSnapshot_intentDomainId_createdAt_idx" ON "QuestionSignalSnapshot"("intentDomainId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestionBankEntry" ADD CONSTRAINT "QuestionBankEntry_intentDomainId_fkey" FOREIGN KEY ("intentDomainId") REFERENCES "IntentDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSignalSnapshot" ADD CONSTRAINT "QuestionSignalSnapshot_intentDomainId_fkey" FOREIGN KEY ("intentDomainId") REFERENCES "IntentDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
