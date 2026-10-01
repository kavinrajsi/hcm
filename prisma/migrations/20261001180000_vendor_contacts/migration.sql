-- Vendors can have several contact people (sales, service, accounts…),
-- one of them primary. Each existing contact person becomes the vendor's
-- primary contact. Vendor.contactPerson stays for now (old deploys still
-- read it) and can be dropped once this code is live. Additive only.

-- AlterTable
ALTER TABLE "DevicePurchaseRequest" ADD COLUMN     "contactName" TEXT;

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorContact_vendorId_position_idx" ON "VendorContact"("vendorId", "position");

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Copy each vendor's contact person into a primary contact
INSERT INTO "VendorContact" ("id", "vendorId", "name", "isPrimary", "position", "updatedAt")
SELECT gen_random_uuid()::text, "id", trim("contactPerson"), true, 0, CURRENT_TIMESTAMP
FROM "Vendor" WHERE coalesce(trim("contactPerson"), '') <> '';
