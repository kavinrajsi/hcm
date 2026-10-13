-- Quantum Sheet: Card Table cards and steps alongside to-dos. Existing rows are to-dos. Additive only.

-- AlterTable
ALTER TABLE "QuantumTodo" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'Todo';

-- CreateIndex
CREATE INDEX "QuantumTodo_kind_idx" ON "QuantumTodo"("kind");

