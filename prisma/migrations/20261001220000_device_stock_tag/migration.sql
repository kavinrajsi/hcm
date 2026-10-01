-- Assigned devices take the holder's code as their asset tag
-- (MAD-LAP-<emp code>); stockTag keeps the numbered tag a device returns
-- to. Nullable so older deploys can still add devices; existing devices
-- keep their current tag as their stock tag.

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "stockTag" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_stockTag_key" ON "Device"("stockTag");


-- Existing devices: their current numbered tag is their stock tag
UPDATE "Device" SET "stockTag" = "assetTag" WHERE "stockTag" IS NULL;
