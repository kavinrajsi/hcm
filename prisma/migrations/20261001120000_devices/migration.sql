-- Devices: company laptops, mice, iPads and USB hubs with QR labels,
-- assignment history, and issue/service tickets with a status timeline.

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('LAPTOP', 'MOUSE', 'IPAD', 'USB_HUB', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'IN_SERVICE', 'RETIRED', 'LOST');

-- CreateEnum
CREATE TYPE "DeviceTicketStatus" AS ENUM ('OPEN', 'SENT_FOR_SERVICE', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT,
    "specs" TEXT,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(12,2),
    "vendor" TEXT,
    "warrantyEndsOn" DATE,
    "notes" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'IN_STOCK',
    "holderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAssignment" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "conditionOut" TEXT,
    "conditionIn" TEXT,
    "assignedById" TEXT,
    "returnedById" TEXT,

    CONSTRAINT "DeviceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceTicket" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DeviceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT,
    "serviceVendor" TEXT,
    "sentAt" TIMESTAMP(3),
    "expectedBackOn" DATE,
    "returnedAt" TIMESTAMP(3),
    "cost" DECIMAL(12,2),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_assetTag_key" ON "Device"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Device_publicToken_key" ON "Device"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_holderId_idx" ON "Device"("holderId");

-- CreateIndex
CREATE INDEX "DeviceAssignment_deviceId_assignedAt_idx" ON "DeviceAssignment"("deviceId", "assignedAt" DESC);

-- CreateIndex
CREATE INDEX "DeviceAssignment_employeeId_idx" ON "DeviceAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "DeviceTicket_deviceId_createdAt_idx" ON "DeviceTicket"("deviceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeviceTicket_status_idx" ON "DeviceTicket"("status");

-- CreateIndex
CREATE INDEX "DeviceTicketEvent_ticketId_changedAt_idx" ON "DeviceTicketEvent"("ticketId", "changedAt");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicket" ADD CONSTRAINT "DeviceTicket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicket" ADD CONSTRAINT "DeviceTicket_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicketEvent" ADD CONSTRAINT "DeviceTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DeviceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicketEvent" ADD CONSTRAINT "DeviceTicketEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

