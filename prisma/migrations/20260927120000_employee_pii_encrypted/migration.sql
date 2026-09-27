-- Encrypted copies of contact / personal / statutory fields; the plaintext
-- columns are dropped in a later migration once scripts/encrypt-pii.ts has
-- moved existing rows.
ALTER TABLE "Employee" ADD COLUMN "phoneEnc" TEXT,
ADD COLUMN "personalEmailEnc" TEXT,
ADD COLUMN "emergencyContactEnc" TEXT,
ADD COLUMN "addressEnc" TEXT,
ADD COLUMN "dateOfBirthEnc" TEXT,
ADD COLUMN "pfNumberEnc" TEXT,
ADD COLUMN "uanNumberEnc" TEXT,
ADD COLUMN "bankAccountHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_bankAccountHash_key" ON "Employee"("bankAccountHash");
