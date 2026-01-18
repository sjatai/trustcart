-- AlterTable
ALTER TABLE "ContentRecommendation" ADD COLUMN     "productHandle" TEXT,
ADD COLUMN     "productTitle" TEXT,
ADD COLUMN     "publishTarget" "PublishTarget" NOT NULL DEFAULT 'FAQ',
ADD COLUMN     "questionText" TEXT;

