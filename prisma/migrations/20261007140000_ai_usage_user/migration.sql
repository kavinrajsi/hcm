-- Who made each AI call (MadMax chat), for per-person monthly caps. Additive only.

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
