-- Quantum Sheet hours: Basecamp Timesheet entries plus hours people log in HCM. Additive only.

-- CreateTable
CREATE TABLE "QuantumHours" (
    "id" TEXT NOT NULL,
    "todoBasecampId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "basecampEntryId" TEXT,
    "personName" TEXT,
    "employeeId" TEXT,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantumHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuantumHours_basecampEntryId_key" ON "QuantumHours"("basecampEntryId");

-- CreateIndex
CREATE INDEX "QuantumHours_todoBasecampId_idx" ON "QuantumHours"("todoBasecampId");

-- CreateIndex
CREATE UNIQUE INDEX "QuantumHours_todoBasecampId_employeeId_key" ON "QuantumHours"("todoBasecampId", "employeeId");

-- AddForeignKey
ALTER TABLE "QuantumHours" ADD CONSTRAINT "QuantumHours_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

