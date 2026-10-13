-- Chat page: Basecamp project chats and lines, copied locally. Additive only.

-- CreateTable
CREATE TABLE "BasecampChat" (
    "basecampId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linesUrl" TEXT NOT NULL,
    "appUrl" TEXT NOT NULL,
    "lastLineAt" TIMESTAMP(3),
    "lastLinePreview" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasecampChat_pkey" PRIMARY KEY ("basecampId")
);

-- CreateTable
CREATE TABLE "BasecampChatLine" (
    "basecampId" TEXT NOT NULL,
    "chatBasecampId" TEXT NOT NULL,
    "creatorPersonId" TEXT,
    "creatorName" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "BasecampChatLine_pkey" PRIMARY KEY ("basecampId")
);

-- CreateIndex
CREATE INDEX "BasecampChat_lastLineAt_idx" ON "BasecampChat"("lastLineAt");

-- CreateIndex
CREATE INDEX "BasecampChatLine_chatBasecampId_createdAt_idx" ON "BasecampChatLine"("chatBasecampId", "createdAt");

