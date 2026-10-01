// Adds the laptops rented from Win Technologies as rented devices, In stock.
// Dry run by default; --apply writes. Skips any serial already in HCM, so
// it's safe to re-run.
//
//   npx tsx scripts/import-win-rentals.ts           # show what it would add
//   npx tsx scripts/import-win-rentals.ts --apply   # add them
import "./load-env";
import { db } from "@/lib/db";
import { assetTagPrefix, newPublicToken, nextAssetTag } from "@/lib/devices/devices";
import { WIN_RENTALS, WIN_TECHNOLOGIES, rentalDevice } from "@/lib/devices/win-rentals";

async function main() {
  const apply = process.argv.includes("--apply");
  const vendor = await db.vendor.findFirst({
    where: { name: { equals: WIN_TECHNOLOGIES, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!vendor) throw new Error(`Vendor "${WIN_TECHNOLOGIES}" not found — add it first.`);

  const tags = (
    await db.device.findMany({
      where: { assetTag: { startsWith: assetTagPrefix("LAPTOP") } },
      select: { assetTag: true },
    })
  ).map((row) => row.assetTag);

  let added = 0;
  for (const row of WIN_RENTALS) {
    const device = rentalDevice(row);
    const existing = await db.device.findUnique({
      where: { serialNumber: device.serialNumber },
      select: { assetTag: true },
    });
    if (existing) {
      console.log(`skip  ${row.vendorRef} ${device.serialNumber} — already ${existing.assetTag}`);
      continue;
    }
    const assetTag = nextAssetTag("LAPTOP", tags);
    tags.push(assetTag);
    console.log(
      `${apply ? "add " : "would add"} ${assetTag}  ${row.vendorRef}  ${device.serialNumber}  ${device.brand} ${device.model}  (${device.os})  ₹${device.monthlyRent}/month`,
    );
    if (!apply) continue;
    await db.device.create({
      data: {
        assetTag,
        publicToken: newPublicToken(),
        type: "LAPTOP",
        ...device,
        ownership: "RENTED",
        vendorId: vendor.id,
        status: "IN_STOCK",
      },
    });
    added++;
  }
  console.log(apply ? `Added ${added} device(s) from ${vendor.name}.` : "Dry run — nothing written. Re-run with --apply.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
