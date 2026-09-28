-- Internship / contract end date (INTERN, CONTRACT). Probation keeps its date
-- on ProbationRecord.dueDate.
ALTER TABLE "Employee" ADD COLUMN "empTypeEndsOn" DATE;
