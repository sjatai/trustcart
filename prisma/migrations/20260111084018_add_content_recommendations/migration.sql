-- CreateEnum
CREATE TYPE "RecommendationKind" AS ENUM ('ENRICH', 'CREATE');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'DRAFTED', 'APPROVED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ContentRecommendation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "RecommendationKind" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "suggestedContent" TEXT NOT NULL,
    "claimKey" TEXT,
    "questionId" TEXT,
    "recommendedAssetType" TEXT NOT NULL DEFAULT 'FAQ',
    "llmEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ContentRecommendation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContentRecommendation" ADD CONSTRAINT "ContentRecommendation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ContentRecommendation_customerId_updatedAt_idx" ON "ContentRecommendation"("customerId", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentRecommendation_status_idx" ON "ContentRecommendation"("status");
