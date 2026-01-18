-- CreateEnum
CREATE TYPE "PublishTarget" AS ENUM ('FAQ', 'BLOG', 'PRODUCT');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "tags" TEXT,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "currency" TEXT DEFAULT 'USD',
    "images" JSONB,
    "descriptionHtml" TEXT,
    "specs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPatch" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "bodyMd" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_customerId_updatedAt_idx" ON "Product"("customerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_customerId_handle_key" ON "Product"("customerId", "handle");

-- CreateIndex
CREATE INDEX "ProductPatch_customerId_updatedAt_idx" ON "ProductPatch"("customerId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProductPatch_productId_updatedAt_idx" ON "ProductPatch"("productId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPatch" ADD CONSTRAINT "ProductPatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPatch" ADD CONSTRAINT "ProductPatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

