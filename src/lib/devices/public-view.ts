import type { DeviceType } from "@/generated/prisma/enums";
import { shownModel } from "@/lib/devices/devices";

/**
 * The only device fields shown to someone who scans a label without
 * access. Picks fields explicitly so nothing about the holder can leak if
 * the query grows. Reads the same as the printed sticker: the model hides
 * its "Not given" placeholder and the owner is the vendor, else Madarth.
 */
export function publicDeviceView(device: {
  assetTag: string;
  type: DeviceType;
  brand: string;
  model: string;
  vendor?: { name: string } | null;
}): { assetTag: string; type: DeviceType; brand: string; model: string; owner: string } {
  return {
    assetTag: device.assetTag,
    type: device.type,
    brand: device.brand,
    model: shownModel(device.model),
    owner: device.vendor?.name ?? "Madarth",
  };
}
