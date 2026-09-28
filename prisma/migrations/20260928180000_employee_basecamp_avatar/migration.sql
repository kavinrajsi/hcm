-- Basecamp profile sync: person link and avatar picture.
ALTER TABLE "Employee" ADD COLUMN "basecampPersonId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "avatarBlobKey" TEXT;
ALTER TABLE "Employee" ADD COLUMN "avatarSourceUrl" TEXT;

CREATE UNIQUE INDEX "Employee_basecampPersonId_key" ON "Employee"("basecampPersonId");
