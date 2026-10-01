// Gives every assigned device its holder's asset tag (MAD-LAP-<emp code>)
// and every unassigned one its numbered stock tag. For devices assigned
// before tags followed the holder. Dry run by default; --apply writes.
//
//   npx tsx scripts/retag-assigned-devices.ts           # show changes
//   npx tsx scripts/retag-assigned-devices.ts --apply   # make them
import "./load-env";
import { db } from "@/lib/db";
import { holderAssetTag, stockTagOf } from "@/lib/devices/devices";

async function main() {
  const apply = process.argv.includes("--apply");
  const devices = await db.device.findMany({
    orderBy: { stockTag: "asc" },
    select: {
      id: true,
      type: true,
      assetTag: true,
      stockTag: true,
      holder: { select: { empId: true, name: true } },
    },
  });
  const inUse = new Set(devices.map((device) => device.assetTag.toUpperCase()));
  let changed = 0;
  for (const device of devices) {
    const stock = stockTagOf(device);
    let target = stock;
    if (device.holder) {
      inUse.delete(device.assetTag.toUpperCase());
      target = holderAssetTag(device.type, device.holder.empId, [...inUse]);
    }
    inUse.add(target.toUpperCase());
    if (target === device.assetTag && device.stockTag === stock) continue;
    changed++;
    console.log(
      `${apply ? "retag" : "would retag"} ${device.assetTag} → ${target}${device.holder ? `  (${device.holder.name})` : "  (no holder)"}`,
    );
    if (apply)
      await db.device.update({ where: { id: device.id }, data: { assetTag: target, stockTag: stock } });
  }
  console.log(changed ? (apply ? `Retagged ${changed}.` : "Dry run — re-run with --apply.") : "All tags already right.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
