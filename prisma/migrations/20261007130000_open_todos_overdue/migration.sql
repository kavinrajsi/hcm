-- Overdue open Basecamp to-dos per employee for the Staff ring. Additive only.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "openTodosOverdue" INTEGER;
