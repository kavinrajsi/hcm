-- Contract staff (C2M…) are a distinct employment type.
ALTER TYPE "EmpType" ADD VALUE 'CONTRACT';

-- Existing staff were imported without contact details; fill in later.
ALTER TABLE "Employee" ALTER COLUMN "phone" DROP NOT NULL,
                       ALTER COLUMN "personalEmail" DROP NOT NULL;
