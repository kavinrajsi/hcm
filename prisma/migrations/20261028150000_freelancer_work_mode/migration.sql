-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'ONSITE', 'FLEXIBLE');

-- AlterTable
ALTER TABLE "Freelancer" ADD COLUMN     "designation" TEXT,
ADD COLUMN     "workMode" "WorkMode";

-- CreateIndex
CREATE INDEX "Freelancer_workMode_idx" ON "Freelancer"("workMode");

