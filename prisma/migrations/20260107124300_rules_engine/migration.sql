-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "gatingSummary" JSONB,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruleSetId" TEXT,
ADD COLUMN     "segmentSize" INTEGER,
ADD COLUMN     "suppressedSize" INTEGER;

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentSnapshot" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "suppressed" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleSet_customerId_updatedAt_idx" ON "RuleSet"("customerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSet_customerId_name_key" ON "RuleSet"("customerId", "name");

-- CreateIndex
CREATE INDEX "SegmentSnapshot_customerId_createdAt_idx" ON "SegmentSnapshot"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SegmentSnapshot_ruleSetId_createdAt_idx" ON "SegmentSnapshot"("ruleSetId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentSnapshot" ADD CONSTRAINT "SegmentSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentSnapshot" ADD CONSTRAINT "SegmentSnapshot_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
