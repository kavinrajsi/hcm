-- Open Basecamp to-do counts per employee for the Staff page. Additive only.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "openTodosDated" INTEGER,
ADD COLUMN     "openTodosUndated" INTEGER,
ADD COLUMN     "openTodosSyncedAt" TIMESTAMP(3);
