import type { DeviceType } from "@/generated/prisma/enums";
import { shownModel } from "@/lib/devices/devices";

/**
 * The only device fields shown to someone who scans a label without
 * access. Picks fields explicitly so nothing else (IDs, email, purchase
 * details) can leak if the query grows. Reads the same as the printed
 * sticker: the model hides its "Not given" placeholder, the owner is the
 * vendor (else Madarth), and the holder's name shows when assigned.
 */
export function publicDeviceView(device: {
  assetTag: string;
  type: DeviceType;
  brand: string;
  model: string;
  vendor?: { name: string } | null;
  holder?: { name: string } | null;
}): {
  assetTag: string;
  type: DeviceType;
  brand: string;
  model: string;
  owner: string;
  holderName: string | null;
} {
  return {
    assetTag: device.assetTag,
    type: device.type,
    brand: device.brand,
    model: shownModel(device.model),
    owner: device.vendor?.name ?? "Madarth",
    holderName: device.holder?.name ?? null,
  };
}
