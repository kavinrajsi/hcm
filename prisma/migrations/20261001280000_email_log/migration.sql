-- Email log (Admin -> Email log). Additive only.

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'NOT_SENT');

-- CreateEnum
CREATE TYPE "EmailDelivery" AS ENUM ('DELIVERED', 'OPENED', 'BOUNCED');

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "attachmentNames" TEXT[],
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "delivery" "EmailDelivery",
    "deliveryAt" TIMESTAMP(3),
    "events" JSONB NOT NULL DEFAULT '[]',
    "resendable" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "sentById" TEXT,
    "resendOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_kind_idx" ON "EmailLog"("kind");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_providerId_idx" ON "EmailLog"("providerId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

