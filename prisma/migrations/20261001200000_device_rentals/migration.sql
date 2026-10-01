-- Rented devices: ownership (owned or rented), monthly rent, and the
-- vendor's own reference for the device. Additive; existing devices
-- become OWNED.

-- CreateEnum
CREATE TYPE "DeviceOwnership" AS ENUM ('OWNED', 'RENTED');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "monthlyRent" DECIMAL(12,2),
ADD COLUMN     "ownership" "DeviceOwnership" NOT NULL DEFAULT 'OWNED',
ADD COLUMN     "vendorRef" TEXT;

