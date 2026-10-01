import type { DeviceType } from "@/generated/prisma/enums";

/**
 * The only device fields shown to someone who scans a label without
 * access. Picks fields explicitly so nothing about the holder can leak if
 * the query grows.
 */
export function publicDeviceView(device: {
  assetTag: string;
  type: DeviceType;
  brand: string;
  model: string;
}): { assetTag: string; type: DeviceType; brand: string; model: string } {
  return {
    assetTag: device.assetTag,
    type: device.type,
    brand: device.brand,
    model: device.model,
  };
}
