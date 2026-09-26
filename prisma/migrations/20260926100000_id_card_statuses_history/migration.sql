-- ID card workflow: add ASSIGNED_TO_DESIGNER and RE_ISSUE, retire CORRECTION.
-- Existing CORRECTION cards move to ASSIGNED_TO_DESIGNER.
CREATE TYPE "IdCardStatus_new" AS ENUM ('PHOTO_TAKEN', 'ASSIGNED_TO_DESIGNER', 'PENDING', 'ISSUED', 'RE_ISSUE', 'RETURN_PENDING', 'RETURNED');
ALTER TABLE "IdCard" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "IdCard" ALTER COLUMN "status" TYPE "IdCardStatus_new" USING (
  CASE WHEN "status"::text = 'CORRECTION' THEN 'ASSIGNED_TO_DESIGNER' ELSE "status"::text END
)::"IdCardStatus_new";
DROP TYPE "IdCardStatus";
ALTER TYPE "IdCardStatus_new" RENAME TO "IdCardStatus";
ALTER TABLE "IdCard" ALTER COLUMN "status" SET DEFAULT 'PHOTO_TAKEN';

-- CreateTable
CREATE TABLE "IdCardStatusChange" (
    "id" TEXT NOT NULL,
    "idCardId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,

    CONSTRAINT "IdCardStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdCardStatusChange_idCardId_changedAt_idx" ON "IdCardStatusChange"("idCardId", "changedAt" DESC);

-- AddForeignKey
ALTER TABLE "IdCardStatusChange" ADD CONSTRAINT "IdCardStatusChange_idCardId_fkey" FOREIGN KEY ("idCardId") REFERENCES "IdCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCardStatusChange" ADD CONSTRAINT "IdCardStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
