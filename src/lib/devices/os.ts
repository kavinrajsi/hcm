import { z } from "zod";
import type { DeviceOs } from "@/generated/prisma/enums";

// Which laptop OS each designation usually gets. A recommendation, not a
// rule: HR can still give someone another laptop when the role needs it.
// Stored in AppSetting "laptopOsByDesignation"; these are the defaults.

export const DEVICE_OSES = ["MAC", "WINDOWS", "OTHER"] as const;

export const DEVICE_OS_LABELS: Record<DeviceOs, string> = {
  MAC: "Mac",
  WINDOWS: "Windows",
  OTHER: "Other OS",
};

export const LAPTOP_OS_SETTING = "laptopOsByDesignation";

export const DEFAULT_LAPTOP_OS: Record<string, DeviceOs> = {
  Copywriter: "WINDOWS",
  Designer: "MAC",
  SMM: "WINDOWS",
  CGP: "WINDOWS",
  Editor: "MAC",
  BD: "MAC",
  "UI/UX Designer": "MAC",
  HCM: "WINDOWS",
};

export function isDeviceOs(value: unknown): value is DeviceOs {
  return typeof value === "string" && (DEVICE_OSES as readonly string[]).includes(value);
}

/** Stored map, or the defaults when nothing valid is stored. */
export function readLaptopOsMap(value: unknown): Record<string, DeviceOs> {
  const parsed = z.record(z.string(), z.enum(DEVICE_OSES)).safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LAPTOP_OS;
}

/** The OS a designation usually gets (case and spacing ignored), or null. */
export function recommendedOs(
  designation: string | null | undefined,
  map: Record<string, DeviceOs>,
): DeviceOs | null {
  const key = designation?.trim().toLowerCase();
  if (!key) return null;
  for (const [name, os] of Object.entries(map)) {
    if (name.trim().toLowerCase() === key) return os;
  }
  return null;
}

/** "Laptop (Mac)" style suffix, empty when unknown. */
export function osSuffix(os: DeviceOs | null | undefined): string {
  return os ? ` (${DEVICE_OS_LABELS[os]})` : "";
}
