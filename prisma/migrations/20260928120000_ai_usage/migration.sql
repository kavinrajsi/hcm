-- Admin → AI usage: one row per AI Gateway call.
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "trigger" TEXT,
    "model" TEXT NOT NULL,
    "items" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(12,8),
    "generationId" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
