-- Experienced hires: one row per previous company with that company's
-- offer / experience / relieving letters, replacing the single set of
-- letter columns on Employee. Existing letters move into a
-- "Previous company" row before the columns are dropped.

-- CreateTable
CREATE TABLE "PreviousEmployment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "offerLetterBlobKey" TEXT,
    "experienceLetterBlobKey" TEXT,
    "relievingLetterBlobKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviousEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreviousEmployment_employeeId_position_idx" ON "PreviousEmployment"("employeeId", "position");

-- AddForeignKey
ALTER TABLE "PreviousEmployment" ADD CONSTRAINT "PreviousEmployment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move existing letters
INSERT INTO "PreviousEmployment" (
    "id", "employeeId", "companyName", "position",
    "offerLetterBlobKey", "experienceLetterBlobKey", "relievingLetterBlobKey",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, "id", 'Previous company', 0,
    "offerLetterBlobKey", "experienceLetterBlobKey", "relievingLetterBlobKey",
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Employee"
WHERE "offerLetterBlobKey" IS NOT NULL
   OR "experienceLetterBlobKey" IS NOT NULL
   OR "relievingLetterBlobKey" IS NOT NULL;

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "experienceLetterBlobKey",
DROP COLUMN "offerLetterBlobKey",
DROP COLUMN "relievingLetterBlobKey";
