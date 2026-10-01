"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { DeviceTicketStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AuthorizationError, requireRole, requireUser } from "@/lib/rbac";
import { DEVICE_ACCESS_SELECT, deviceAccess } from "@/lib/devices/access";
import {
  DEVICE_TYPES,
  assetTagPrefix,
  canAssign,
  canMoveTicket,
  newPublicToken,
  nextAssetTag,
  statusAfterService,
} from "@/lib/devices/devices";

export type DeviceFormState = { error?: string; ok?: string };

const optional = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();
const optionalDate = optional.refine(
  (value) => value === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value),
  "Dates must be YYYY-MM-DD",
);
const optionalMoney = optional.refine(
  (value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value),
  "Amounts must be a number like 54999 or 54999.50",
);

const deviceSchema = z.object({
  type: z.enum(DEVICE_TYPES),
  brand: z.string().trim().min(1, "Brand is required"),
  model: z.string().trim().min(1, "Model is required"),
  serialNumber: optional,
  specs: optional,
  purchaseDate: optionalDate,
  purchasePrice: optionalMoney,
  vendor: optional,
  warrantyEndsOn: optionalDate,
  notes: optional,
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function deviceData(data: z.infer<typeof deviceSchema>) {
  return {
    type: data.type,
    brand: data.brand,
    model: data.model,
    serialNumber: data.serialNumber ?? null,
    specs: data.specs ?? null,
    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
    purchasePrice: data.purchasePrice ?? null,
    vendor: data.vendor ?? null,
    warrantyEndsOn: data.warrantyEndsOn ? new Date(data.warrantyEndsOn) : null,
    notes: data.notes ?? null,
  };
}

function parseDevice(formData: FormData) {
  return deviceSchema.safeParse(
    Object.fromEntries(
      Object.keys(deviceSchema.shape).map((key) => [key, field(formData, key)]),
    ),
  );
}

function isUniqueClash(error: unknown, column?: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (!column || JSON.stringify(error.meta ?? {}).includes(column))
  );
}

function revalidateDevice(id?: string) {
  revalidatePath("/devices");
  revalidatePath("/profile");
  if (id) revalidatePath(`/devices/${id}`);
}

/** The device plus the caller's access; throws when they have none. */
async function requireDeviceAccess(deviceId: string, need: "manage" | "act") {
  const user = await requireUser();
  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: { id: true, status: true, holderId: true, ...DEVICE_ACCESS_SELECT },
  });
  if (!device) throw new Error("Device not found");
  const access = deviceAccess(user, device);
  if (!access || (need === "manage" && access !== "manage"))
    throw new AuthorizationError();
  return { user, device };
}

// --- HR: add, edit, assign, return, retire ---

export async function createDevice(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = parseDevice(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid device" };
  const employeeId = field(formData, "employeeId") || null;
  const conditionOut = field(formData, "conditionOut")?.trim() || null;

  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const existing = await db.device.findMany({
      where: { assetTag: { startsWith: assetTagPrefix(parsed.data.type) } },
      select: { assetTag: true },
    });
    try {
      created = await db.device.create({
        data: {
          ...deviceData(parsed.data),
          assetTag: nextAssetTag(
            parsed.data.type,
            existing.map((row) => row.assetTag),
          ),
          publicToken: newPublicToken(),
          status: employeeId ? "ASSIGNED" : "IN_STOCK",
          holderId: employeeId,
          assignments: employeeId
            ? { create: { employeeId, conditionOut, assignedById: user.id } }
            : undefined,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueClash(error, "serialNumber"))
        return { error: "Another device already has that serial number." };
      // Two devices added at once can draw the same tag; draw again.
      if (!isUniqueClash(error, "assetTag")) throw error;
    }
  }
  if (!created) return { error: "Couldn't allocate an asset tag. Try again." };
  revalidateDevice();
  redirect(`/devices/${created.id}`);
}

export async function updateDevice(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  await requireRole("HR_ADMIN");
  const id = field(formData, "id");
  if (!id) return { error: "Missing device" };
  const parsed = parseDevice(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid device" };
  try {
    // The asset tag stays: it's printed on the label.
    const { type: _type, ...rest } = deviceData(parsed.data);
    void _type;
    await db.device.update({ where: { id }, data: rest });
  } catch (error) {
    if (isUniqueClash(error, "serialNumber"))
      return { error: "Another device already has that serial number." };
    throw error;
  }
  revalidateDevice(id);
  return { ok: "Saved." };
}

export async function assignDevice(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const deviceId = field(formData, "deviceId") ?? "";
  const employeeId = field(formData, "employeeId") ?? "";
  if (!employeeId) return { error: "Pick an employee." };
  const { user, device } = await requireDeviceAccess(deviceId, "manage");
  if (!canAssign(device.status))
    return { error: "Only devices in stock or assigned can be handed out." };
  if (device.holderId === employeeId)
    return { error: "They already have this device." };
  const now = new Date();
  await db.$transaction([
    db.deviceAssignment.updateMany({
      where: { deviceId, returnedAt: null },
      data: { returnedAt: now, returnedById: user.id },
    }),
    db.deviceAssignment.create({
      data: {
        deviceId,
        employeeId,
        assignedAt: now,
        conditionOut: field(formData, "conditionOut")?.trim() || null,
        assignedById: user.id,
      },
    }),
    db.device.update({
      where: { id: deviceId },
      data: { holderId: employeeId, status: "ASSIGNED" },
    }),
  ]);
  revalidateDevice(deviceId);
  return { ok: "Assigned." };
}

export async function returnDevice(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const deviceId = field(formData, "deviceId") ?? "";
  const { user, device } = await requireDeviceAccess(deviceId, "manage");
  if (!device.holderId) return { error: "Nobody holds this device." };
  if (device.status === "IN_SERVICE")
    return { error: "It's out for service. Mark it back first." };
  await db.$transaction([
    db.deviceAssignment.updateMany({
      where: { deviceId, returnedAt: null },
      data: {
        returnedAt: new Date(),
        returnedById: user.id,
        conditionIn: field(formData, "conditionIn")?.trim() || null,
      },
    }),
    db.device.update({
      where: { id: deviceId },
      data: { holderId: null, status: "IN_STOCK" },
    }),
  ]);
  revalidateDevice(deviceId);
  return { ok: "Returned to stock." };
}

const RETIRE_TO = ["RETIRED", "LOST", "IN_STOCK"] as const;

/** Retire or mark lost (closes any assignment), or bring back to stock. */
export async function setDeviceStatus(formData: FormData) {
  const deviceId = field(formData, "deviceId") ?? "";
  const status = field(formData, "status");
  if (!(RETIRE_TO as readonly string[]).includes(status ?? "")) return;
  const { user, device } = await requireDeviceAccess(deviceId, "manage");
  if (device.status === "IN_SERVICE") return;
  await db.$transaction([
    db.deviceAssignment.updateMany({
      where: { deviceId, returnedAt: null },
      data: { returnedAt: new Date(), returnedById: user.id },
    }),
    db.device.update({
      where: { id: deviceId },
      data: { status: status as (typeof RETIRE_TO)[number], holderId: null },
    }),
  ]);
  revalidateDevice(deviceId);
}

// --- HR, the holder, the holder's manager: issues and service ---

const issueSchema = z.object({
  title: z.string().trim().min(3, "Say what's wrong in a few words."),
  description: z.string().trim().min(1, "Add a little detail."),
});

export async function reportIssue(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const deviceId = field(formData, "deviceId") ?? "";
  const { user } = await requireDeviceAccess(deviceId, "act");
  const parsed = issueSchema.safeParse({
    title: field(formData, "title"),
    description: field(formData, "description"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid issue" };
  await db.deviceTicket.create({
    data: {
      deviceId,
      ...parsed.data,
      reportedById: user.id,
      events: { create: { toStatus: "OPEN", changedById: user.id } },
    },
  });
  revalidateDevice(deviceId);
  return { ok: "Issue reported." };
}

/** Loads a ticket and checks the caller may act on its device. */
async function requireTicket(ticketId: string) {
  const ticket = await db.deviceTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, deviceId: true },
  });
  if (!ticket) throw new Error("Ticket not found");
  const { user, device } = await requireDeviceAccess(ticket.deviceId, "act");
  return { user, device, ticket };
}

function moveEvent(
  ticketId: string,
  from: DeviceTicketStatus,
  to: DeviceTicketStatus,
  userId: string,
  note: string | null,
) {
  return db.deviceTicketEvent.create({
    data: { ticketId, fromStatus: from, toStatus: to, changedById: userId, note },
  });
}

export async function sendForService(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const { user, device, ticket } = await requireTicket(field(formData, "ticketId") ?? "");
  if (!canMoveTicket(ticket.status, "SENT_FOR_SERVICE"))
    return { error: "Only open issues can be sent for service." };
  if (device.status === "IN_SERVICE")
    return { error: "This device is already out for service." };
  const vendor = field(formData, "serviceVendor")?.trim();
  if (!vendor) return { error: "Where is it going? Add the service centre." };
  const expected = field(formData, "expectedBackOn")?.trim();
  if (expected && !/^\d{4}-\d{2}-\d{2}$/.test(expected))
    return { error: "Expected date must be YYYY-MM-DD." };
  const note = field(formData, "note")?.trim() || null;
  await db.$transaction([
    db.deviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: "SENT_FOR_SERVICE",
        serviceVendor: vendor,
        sentAt: new Date(),
        expectedBackOn: expected ? new Date(expected) : null,
      },
    }),
    db.device.update({ where: { id: device.id }, data: { status: "IN_SERVICE" } }),
    moveEvent(ticket.id, ticket.status, "SENT_FOR_SERVICE", user.id, note ?? `Sent to ${vendor}`),
  ]);
  revalidateDevice(device.id);
  return { ok: "Sent for service." };
}

export async function resolveTicket(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const { user, device, ticket } = await requireTicket(field(formData, "ticketId") ?? "");
  if (!canMoveTicket(ticket.status, "RESOLVED"))
    return { error: "This issue is already closed." };
  const resolution = field(formData, "resolution")?.trim();
  if (!resolution) return { error: "Say how it was resolved." };
  const cost = field(formData, "cost")?.trim();
  if (cost && !/^\d+(\.\d{1,2})?$/.test(cost))
    return { error: "Cost must be a number like 2500 or 2500.50." };
  const wasOut = ticket.status === "SENT_FOR_SERVICE";
  await db.$transaction([
    db.deviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: "RESOLVED",
        resolution,
        cost: cost || null,
        returnedAt: wasOut ? new Date() : null,
      },
    }),
    ...(wasOut && device.status === "IN_SERVICE"
      ? [
          db.device.update({
            where: { id: device.id },
            data: { status: statusAfterService(device.holderId) },
          }),
        ]
      : []),
    moveEvent(ticket.id, ticket.status, "RESOLVED", user.id, resolution),
  ]);
  revalidateDevice(device.id);
  return { ok: wasOut ? "Back from service." : "Resolved." };
}

export async function cancelTicket(formData: FormData) {
  const { user, device, ticket } = await requireTicket(field(formData, "ticketId") ?? "");
  if (!canMoveTicket(ticket.status, "CANCELLED")) return;
  await db.$transaction([
    db.deviceTicket.update({ where: { id: ticket.id }, data: { status: "CANCELLED" } }),
    moveEvent(ticket.id, ticket.status, "CANCELLED", user.id, null),
  ]);
  revalidateDevice(device.id);
}
