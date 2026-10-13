-- Chat page: when each person last saw each chat (unread counts). Additive only.

-- CreateTable
CREATE TABLE "BasecampChatRead" (
    "userId" TEXT NOT NULL,
    "chatBasecampId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasecampChatRead_pkey" PRIMARY KEY ("userId","chatBasecampId")
);

