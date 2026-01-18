-- AlterTable
ALTER TABLE "QuestionNeed" ADD CONSTRAINT "QuestionNeed_questionId_claimKey_key" UNIQUE ("questionId", "claimKey");


