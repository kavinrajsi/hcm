-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('IN_PERSON', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "QuantumSource" AS ENUM ('MANUAL', 'BASECAMP');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LetterType" AS ENUM ('OFFER', 'INTERN', 'COMPENSATION');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "QuantumEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "brand" TEXT NOT NULL,
    "workName" TEXT NOT NULL,
    "link" TEXT,
    "durationMins" INTEGER NOT NULL,
    "source" "QuantumSource" NOT NULL DEFAULT 'MANUAL',
    "basecampId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantumEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "trainer" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL DEFAULT 'IN_PERSON',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRegistration" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAttendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "sessionName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "trainer" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Freelancer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "skillset" TEXT NOT NULL,
    "rate" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Freelancer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LetterType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewMeeting" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasecampToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasecampToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuantumEntry_employeeId_date_idx" ON "QuantumEntry"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "QuantumEntry_employeeId_basecampId_key" ON "QuantumEntry"("employeeId", "basecampId");

-- CreateIndex
CREATE INDEX "TrainingSession_date_idx" ON "TrainingSession"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRegistration_sessionId_employeeId_key" ON "SessionRegistration"("sessionId", "employeeId");

-- CreateIndex
CREATE INDEX "SessionAttendance_employeeId_date_idx" ON "SessionAttendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "SessionAttendance_date_idx" ON "SessionAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Freelancer_employeeId_key" ON "Freelancer"("employeeId");

-- CreateIndex
CREATE INDEX "Freelancer_name_idx" ON "Freelancer"("name");

-- CreateIndex
CREATE INDEX "Freelancer_skillset_idx" ON "Freelancer"("skillset");

-- CreateIndex
CREATE INDEX "Freelancer_availability_idx" ON "Freelancer"("availability");

-- CreateIndex
CREATE INDEX "Letter_employeeId_idx" ON "Letter"("employeeId");

-- CreateIndex
CREATE INDEX "ReviewMeeting_employeeId_date_idx" ON "ReviewMeeting"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BasecampToken_userId_key" ON "BasecampToken"("userId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantumEntry" ADD CONSTRAINT "QuantumEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRegistration" ADD CONSTRAINT "SessionRegistration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRegistration" ADD CONSTRAINT "SessionRegistration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAttendance" ADD CONSTRAINT "SessionAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAttendance" ADD CONSTRAINT "SessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Freelancer" ADD CONSTRAINT "Freelancer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewMeeting" ADD CONSTRAINT "ReviewMeeting_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
