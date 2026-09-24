-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "LeaveEntry" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "LeaveEntry_status_idx" ON "LeaveEntry"("status");

-- AddForeignKey
ALTER TABLE "LeaveEntry" ADD CONSTRAINT "LeaveEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: posts imported before approval existed are history, not requests.
UPDATE "LeaveEntry" SET "status" = 'APPROVED';
