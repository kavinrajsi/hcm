-- Quantum Sheet timesheet view: each Basecamp timesheet entry's note and person id. Additive only.

-- AlterTable
ALTER TABLE "QuantumHours" ADD COLUMN     "note" TEXT,
ADD COLUMN     "personId" TEXT;

