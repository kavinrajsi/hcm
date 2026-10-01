-- One-week employment-end reminders already sent to HR (one per
-- employee, kind and end date). Additive only.

-- CreateTable
CREATE TABLE "EmploymentReminder" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "endsOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentReminder_employeeId_kind_endsOn_key" ON "EmploymentReminder"("employeeId", "kind", "endsOn");

-- AddForeignKey
ALTER TABLE "EmploymentReminder" ADD CONSTRAINT "EmploymentReminder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

