-- Quantum Sheet: a local copy of Basecamp to-dos (last 12 months), synced
-- incrementally so the page never calls Basecamp. Additive only.

-- CreateTable
CREATE TABLE "QuantumTodo" (
    "id" TEXT NOT NULL,
    "basecampId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "listName" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueOn" DATE,
    "sheetDay" DATE,
    "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appUrl" TEXT NOT NULL,
    "basecampCreatedAt" TIMESTAMP(3) NOT NULL,
    "basecampUpdatedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantumTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuantumTodo_basecampId_key" ON "QuantumTodo"("basecampId");

-- CreateIndex
CREATE INDEX "QuantumTodo_projectId_idx" ON "QuantumTodo"("projectId");

-- CreateIndex
CREATE INDEX "QuantumTodo_sheetDay_idx" ON "QuantumTodo"("sheetDay");

-- CreateIndex
CREATE INDEX "QuantumTodo_basecampUpdatedAt_idx" ON "QuantumTodo"("basecampUpdatedAt");

-- CreateIndex
CREATE INDEX "QuantumTodo_assigneeIds_idx" ON "QuantumTodo" USING GIN ("assigneeIds");
