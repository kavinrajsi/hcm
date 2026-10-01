import { db } from "@/lib/db";
import { LAPTOP_OS_SETTING, readLaptopOsMap } from "@/lib/devices/os";

/** The stored designation → laptop OS map (defaults when unset). */
export async function laptopOsMap() {
  const row = await db.appSetting.findUnique({ where: { key: LAPTOP_OS_SETTING } });
  return readLaptopOsMap(row?.value);
}
