-- Device vendors: who sells and repairs devices, with contact details.
-- Devices and service tickets now point at a Vendor instead of holding a
-- typed name. Every distinct name already typed becomes a vendor (phone
-- left blank to fill in), and rows are linked before the text columns go.

-- CreateEnum
CREATE TYPE "VendorKind" AS ENUM ('SALES', 'SERVICE', 'BOTH');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VendorKind" NOT NULL DEFAULT 'BOTH',
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_kind_active_idx" ON "Vendor"("kind", "active");

-- Move typed names into vendors
INSERT INTO "Vendor" ("id", "name", "kind", "phone", "updatedAt")
SELECT gen_random_uuid()::text, n.name, 'BOTH', '', CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT trim("vendor") AS name FROM "Device" WHERE coalesce(trim("vendor"), '') <> ''
    UNION
    SELECT DISTINCT trim("serviceVendor") FROM "DeviceTicket" WHERE coalesce(trim("serviceVendor"), '') <> ''
) n;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "DeviceTicket" ADD COLUMN "serviceVendorId" TEXT;

UPDATE "Device" d SET "vendorId" = v."id" FROM "Vendor" v WHERE v."name" = trim(d."vendor");
UPDATE "DeviceTicket" t SET "serviceVendorId" = v."id" FROM "Vendor" v WHERE v."name" = trim(t."serviceVendor");

ALTER TABLE "Device" DROP COLUMN "vendor";
ALTER TABLE "DeviceTicket" DROP COLUMN "serviceVendor";

-- CreateIndex
CREATE INDEX "Device_vendorId_idx" ON "Device"("vendorId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicket" ADD CONSTRAINT "DeviceTicket_serviceVendorId_fkey" FOREIGN KEY ("serviceVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
