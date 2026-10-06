-- Resume scores and per-role criteria. Additive only; the website's candidates
-- table is not altered (CandidateScore references it).

-- CreateEnum
CREATE TYPE "CandidateScoreStatus" AS ENUM ('SCORED', 'NO_RESUME', 'FAILED');

-- CreateTable
CREATE TABLE "CandidateScore" (
    "id" TEXT NOT NULL,
    "candidateId" BIGINT NOT NULL,
    "status" "CandidateScoreStatus" NOT NULL,
    "score" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT[],
    "gaps" TEXT[],
    "role" TEXT,
    "usedCriteria" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleCriteria" (
    "id" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateScore_candidateId_key" ON "CandidateScore"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateScore_score_idx" ON "CandidateScore"("score");

-- CreateIndex
CREATE INDEX "CandidateScore_status_idx" ON "CandidateScore"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RoleCriteria_roleKey_key" ON "RoleCriteria"("roleKey");

-- AddForeignKey
ALTER TABLE "CandidateScore" ADD CONSTRAINT "CandidateScore_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleCriteria" ADD CONSTRAINT "RoleCriteria_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

