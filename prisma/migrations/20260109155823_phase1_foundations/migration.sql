-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('READ', 'DECIDE', 'EXECUTE', 'PUBLISH', 'SUPPRESS');

-- CreateEnum
CREATE TYPE "ReceiptActor" AS ENUM ('CRAWLER', 'ORCHESTRATOR', 'INTENT_ENGINE', 'TRUST_ENGINE', 'CONTENT_ENGINE', 'RULE_ENGINE', 'DELIVERY');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "questionId" TEXT;

-- CreateTable
CREATE TABLE "ConsumerTrustSnapshot" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 70,
    "clarity" INTEGER NOT NULL DEFAULT 70,
    "proof" INTEGER NOT NULL DEFAULT 70,
    "freshness" INTEGER NOT NULL DEFAULT 70,
    "consistency" INTEGER NOT NULL DEFAULT 70,
    "sentimentLift" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumerTrustSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetEvidence" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "snippet" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "ReceiptKind" NOT NULL,
    "actor" "ReceiptActor" NOT NULL,
    "summary" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndCustomer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumerTrustSnapshot_customerId_idx" ON "ConsumerTrustSnapshot"("customerId");

-- CreateIndex
CREATE INDEX "AssetEvidence_assetId_idx" ON "AssetEvidence"("assetId");

-- CreateIndex
CREATE INDEX "Receipt_customerId_createdAt_idx" ON "Receipt"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_sessionId_createdAt_idx" ON "Receipt"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "EndCustomer_customerId_idx" ON "EndCustomer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "EndCustomer_customerId_email_key" ON "EndCustomer"("customerId", "email");

-- CreateIndex
CREATE INDEX "Asset_customerId_questionId_idx" ON "Asset"("customerId", "questionId");

-- AddForeignKey
ALTER TABLE "ConsumerTrustSnapshot" ADD CONSTRAINT "ConsumerTrustSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetEvidence" ADD CONSTRAINT "AssetEvidence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndCustomer" ADD CONSTRAINT "EndCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
