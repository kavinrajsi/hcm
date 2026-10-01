import { randomBytes } from "node:crypto";
import type {
  DeviceOwnership,
  DeviceStatus,
  DeviceTicketStatus,
  DeviceType,
} from "@/generated/prisma/enums";

// Company devices: labels, asset tags, the public QR token, and how a
// device's status follows assignments and service tickets.

export const DEVICE_TYPES = ["LAPTOP", "MOUSE", "IPAD", "USB_HUB", "OTHER"] as const;
export const DEVICE_STATUSES = [
  "IN_STOCK",
  "ASSIGNED",
  "IN_SERVICE",
  "RETIRED",
  "LOST",
] as const;
export const TICKET_STATUSES = [
  "OPEN",
  "SENT_FOR_SERVICE",
  "RESOLVED",
  "CANCELLED",
] as const;

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  LAPTOP: "Laptop",
  MOUSE: "Mouse",
  IPAD: "iPad",
  USB_HUB: "USB hub",
  OTHER: "Other",
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: "In stock",
  ASSIGNED: "Assigned",
  IN_SERVICE: "In service",
  RETIRED: "Retired",
  LOST: "Lost",
};

export const DEVICE_STATUS_CLASSES: Record<DeviceStatus, string> = {
  IN_STOCK: "text-zinc-600 dark:text-zinc-400",
  ASSIGNED: "text-emerald-600 dark:text-emerald-400",
  IN_SERVICE: "text-amber-600 dark:text-amber-400",
  RETIRED: "text-zinc-400",
  LOST: "text-rose-600 dark:text-rose-400",
};

export const TICKET_STATUS_LABELS: Record<DeviceTicketStatus, string> = {
  OPEN: "Open",
  SENT_FOR_SERVICE: "Sent for service",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export const DEVICE_OWNERSHIPS = ["OWNED", "RENTED"] as const;

export const DEVICE_OWNERSHIP_LABELS: Record<DeviceOwnership, string> = {
  OWNED: "Owned",
  RENTED: "Rented",
};

export function isDeviceOwnership(value: unknown): value is DeviceOwnership {
  return (
    typeof value === "string" && (DEVICE_OWNERSHIPS as readonly string[]).includes(value)
  );
}

/** "₹2,400" */
export function formatRupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === "string" && (DEVICE_TYPES as readonly string[]).includes(value);
}
export function isDeviceStatus(value: unknown): value is DeviceStatus {
  return (
    typeof value === "string" && (DEVICE_STATUSES as readonly string[]).includes(value)
  );
}

const TAG_PREFIX: Record<DeviceType, string> = {
  LAPTOP: "LAP",
  MOUSE: "MOU",
  IPAD: "IPD",
  USB_HUB: "HUB",
  OTHER: "OTH",
};

export function assetTagPrefix(type: DeviceType): string {
  return `MAD-${TAG_PREFIX[type]}-`;
}

/** Next tag after the highest existing one of this type: MAD-LAP-0008. */
export function nextAssetTag(type: DeviceType, existing: string[]): string {
  const prefix = assetTagPrefix(type);
  const highest = existing
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number.parseInt(tag.slice(prefix.length), 10))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

/** Unguessable token for the QR URL (/d/<token>). */
export function newPublicToken(): string {
  return randomBytes(12).toString("base64url");
}

/** Device status once an open service trip ends (or a ticket is cancelled). */
export function statusAfterService(holderId: string | null): DeviceStatus {
  return holderId ? "ASSIGNED" : "IN_STOCK";
}

/** Device statuses from which it can be handed to someone. */
export function canAssign(status: DeviceStatus): boolean {
  return status === "IN_STOCK" || status === "ASSIGNED";
}

/** Allowed ticket moves. Send for service only from OPEN. */
export function canMoveTicket(
  from: DeviceTicketStatus,
  to: DeviceTicketStatus,
): boolean {
  const moves: Record<DeviceTicketStatus, DeviceTicketStatus[]> = {
    OPEN: ["SENT_FOR_SERVICE", "RESOLVED", "CANCELLED"],
    SENT_FOR_SERVICE: ["RESOLVED"],
    RESOLVED: [],
    CANCELLED: [],
  };
  return moves[from].includes(to);
}

/** The absolute URL a device's QR code points to. */
export function deviceScanUrl(token: string, origin?: string): string {
  const base = (process.env.AUTH_URL ?? origin ?? "").replace(/\/$/, "");
  return `${base}/d/${token}`;
}
