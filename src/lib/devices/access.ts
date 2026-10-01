import type { Role } from "@/generated/prisma/enums";

// Who may do what with a device. HR manages everything; the device's
// holder and the holder's manager may report issues and send it for
// service; other managers and employees get nothing beyond the public page.

export type DeviceAccess = "manage" | "act" | null;

export function deviceAccess(
  user: { id: string; role: Role },
  device: {
    holder: { userId: string | null; manager: { userId: string | null } | null } | null;
  },
): DeviceAccess {
  if (user.role === "HR_ADMIN") return "manage";
  const holder = device.holder;
  if (!holder) return null;
  if (holder.userId === user.id) return "act";
  if (user.role === "MANAGER" && holder.manager?.userId === user.id) return "act";
  return null;
}

/** Prisma select for the fields deviceAccess needs. */
export const DEVICE_ACCESS_SELECT = {
  holder: {
    select: {
      userId: true,
      manager: { select: { userId: true } },
    },
  },
} as const;
