-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('FULL_DAY', 'HALF_DAY', 'LATE_ARRIVAL', 'EARLY_LOGOUT', 'WFH', 'OTHER');

-- CreateTable
CREATE TABLE "LeaveEntry" (
    "id" TEXT NOT NULL,
    "basecampId" TEXT NOT NULL,
    "employeeId" TEXT,
    "creatorName" TEXT NOT NULL,
    "creatorEmail" TEXT NOT NULL,
    "postedOn" DATE NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "type" "LeaveType",
    "startDate" DATE,
    "endDate" DATE,
    "days" DECIMAL(4,1),
    "reason" TEXT,
    "classifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveEntry_basecampId_key" ON "LeaveEntry"("basecampId");

-- CreateIndex
CREATE INDEX "LeaveEntry_employeeId_startDate_idx" ON "LeaveEntry"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveEntry_postedOn_idx" ON "LeaveEntry"("postedOn");

-- AddForeignKey
ALTER TABLE "LeaveEntry" ADD CONSTRAINT "LeaveEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
