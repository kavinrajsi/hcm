-- CreateTable
CREATE TABLE "candidate_status_changes" (
    "id" TEXT NOT NULL,
    "candidate_id" BIGINT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT,

    CONSTRAINT "candidate_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_status_changes_candidate_id_changed_at_idx" ON "candidate_status_changes"("candidate_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "candidate_status_changes" ADD CONSTRAINT "candidate_status_changes_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_status_changes" ADD CONSTRAINT "candidate_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

