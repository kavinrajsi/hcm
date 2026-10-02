-- The Basecamp to-do created when a pick is recorded on Assign. Additive only.

-- AlterTable
ALTER TABLE "AssignmentQuery" ADD COLUMN "basecampTodoId" TEXT,
ADD COLUMN "basecampTodoUrl" TEXT;
