-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HR_ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmpType" AS ENUM ('INTERN', 'PROBATION', 'PERMANENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "IdCardStatus" AS ENUM ('PHOTO_TAKEN', 'CORRECTION', 'PENDING', 'ISSUED', 'RETURN_PENDING', 'RETURNED');

-- CreateEnum
CREATE TYPE "ProbationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXTENDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "passwordHash" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "bloodGroup" TEXT,
    "tshirtSize" TEXT,
    "phone" TEXT NOT NULL,
    "personalEmail" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "emergencyContact" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "dateOfJoining" DATE NOT NULL,
    "empType" "EmpType" NOT NULL DEFAULT 'PROBATION',
    "isFresher" BOOLEAN NOT NULL DEFAULT true,
    "dateOfExit" DATE,
    "pfNumber" TEXT,
    "uanNumber" TEXT,
    "panEnc" TEXT,
    "aadhaarEnc" TEXT,
    "bankAccountEnc" TEXT,
    "ifscEnc" TEXT,
    "panHash" TEXT,
    "aadhaarHash" TEXT,
    "photoBlobKey" TEXT,
    "panBlobKey" TEXT,
    "aadhaarBlobKey" TEXT,
    "offerLetterBlobKey" TEXT,
    "experienceLetterBlobKey" TEXT,
    "relievingLetterBlobKey" TEXT,
    "linkedinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "joinDate" DATE NOT NULL,
    "designation" TEXT NOT NULL,
    "empType" "EmpType" NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdCard" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "IdCardStatus" NOT NULL DEFAULT 'PHOTO_TAKEN',
    "issuedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbationRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "ProbationStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" DATE NOT NULL,
    "extendedTo" DATE,
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProbationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_empId_key" ON "Employee"("empId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workEmail_key" ON "Employee"("workEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_panHash_key" ON "Employee"("panHash");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_aadhaarHash_key" ON "Employee"("aadhaarHash");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "Employee_dateOfJoining_idx" ON "Employee"("dateOfJoining");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_dateOfExit_idx" ON "Employee"("dateOfExit");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingRecord_employeeId_key" ON "OnboardingRecord"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingRecord_joinDate_idx" ON "OnboardingRecord"("joinDate");

-- CreateIndex
CREATE UNIQUE INDEX "IdCard_employeeId_key" ON "IdCard"("employeeId");

-- CreateIndex
CREATE INDEX "IdCard_status_idx" ON "IdCard"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProbationRecord_employeeId_key" ON "ProbationRecord"("employeeId");

-- CreateIndex
CREATE INDEX "ProbationRecord_dueDate_idx" ON "ProbationRecord"("dueDate");

-- CreateIndex
CREATE INDEX "ProbationRecord_status_idx" ON "ProbationRecord"("status");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRecord" ADD CONSTRAINT "OnboardingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCard" ADD CONSTRAINT "IdCard_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbationRecord" ADD CONSTRAINT "ProbationRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
