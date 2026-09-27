-- Candidate an employee was converted from. No foreign key: the candidates
-- table is owned by the website.
ALTER TABLE "Employee" ADD COLUMN "candidateId" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_candidateId_key" ON "Employee"("candidateId");
