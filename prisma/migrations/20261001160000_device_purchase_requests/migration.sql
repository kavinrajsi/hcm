-- Device purchase requests emailed to vendors (usually for a new joiner),
-- a Mac/Windows field on laptops and requests, and a small key/value table
-- for HR-editable settings (purchase email reply-to and CC, and which OS
-- each designation gets). Additive only.

-- CreateEnum
CREATE TYPE "DeviceOs" AS ENUM ('MAC', 'WINDOWS', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "os" "DeviceOs";

-- CreateTable
CREATE TABLE "DevicePurchaseRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "vendorId" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "os" "DeviceOs",
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "neededBy" DATE,
    "notes" TEXT,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "emailTo" TEXT NOT NULL,
    "emailCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailReplyTo" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "emailId" TEXT,
    "sendError" TEXT,
    "requestedById" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevicePurchaseRequest_deviceId_key" ON "DevicePurchaseRequest"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePurchaseRequest_status_createdAt_idx" ON "DevicePurchaseRequest"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DevicePurchaseRequest_employeeId_idx" ON "DevicePurchaseRequest"("employeeId");

-- AddForeignKey
ALTER TABLE "DevicePurchaseRequest" ADD CONSTRAINT "DevicePurchaseRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePurchaseRequest" ADD CONSTRAINT "DevicePurchaseRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePurchaseRequest" ADD CONSTRAINT "DevicePurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePurchaseRequest" ADD CONSTRAINT "DevicePurchaseRequest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

