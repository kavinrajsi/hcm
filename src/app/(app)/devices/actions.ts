"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { DeviceTicketStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { AuthorizationError, requireRole, requireUser } from "@/lib/rbac";
import { DEVICE_ACCESS_SELECT, deviceAccess } from "@/lib/devices/access";
import { SALES_KINDS, SERVICE_KINDS } from "@/lib/devices/vendors";
import { DEVICE_OSES } from "@/lib/devices/os";
import {
  DEVICE_OWNERSHIPS,
  DEVICE_TYPES,
  assetTagPrefix,
  canAssign,
  canMoveTicket,
  holderAssetTag,
  newPublicToken,
  nextAssetTag,
  statusAfterService,
  stockTagOf,
} from "@/lib/devices/devices";
import type { DeviceType } from "@/generated/prisma/enums";

export type DeviceFormState = FormState;

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

const deviceSchema = z
  .object({
    type: z.enum(DEVICE_TYPES),
    ownership: z.enum(DEVICE_OWNERSHIPS).optional().default("OWNED"),
    monthlyRent: optionalMoney,
    vendorRef: optional,
    brand: z.string().trim().min(1, "Brand is required"),
    model: z.string().trim().min(1, "Model is required"),
    serialNumber: optional,
    specs: optional,
    os: z
      .enum(DEVICE_OSES)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    purchaseDate: optionalDate,
    purchasePrice: optionalMoney,
    vendorId: optional,
    warrantyEndsOn: optionalDate,
    notes: optional,
  })
  .refine((device) => device.ownership !== "RENTED" || device.vendorId, {
    message: "A rented device needs the vendor it's rented from.",
    path: ["vendorId"],
  })
  .refine((device) => device.ownership !== "RENTED" || device.monthlyRent, {
    message: "A rented device needs its monthly rent.",
    path: ["monthlyRent"],
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
    os: data.os ?? null,
    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
    purchasePrice: data.purchasePrice ?? null,
    vendorId: data.vendorId ?? null,
    warrantyEndsOn: data.warrantyEndsOn ? new Date(data.warrantyEndsOn) : null,
    notes: data.notes ?? null,
    ownership: data.ownership,
    // Rent only means something for a rented device.
    monthlyRent:
      data.ownership === "RENTED" ? (data.monthlyRent ?? null) : null,
    vendorRef: data.vendorRef ?? null,
  };
}

const DEVICE_FIELDS = [
  "type",
  "ownership",
  "monthlyRent",
  "vendorRef",
  "brand",
  "model",
  "serialNumber",
  "specs",
  "os",
  "purchaseDate",
  "purchasePrice",
  "vendorId",
  "warrantyEndsOn",
  "notes",
] as const;

function parseDevice(formData: FormData) {
  return deviceSchema.safeParse(
    Object.fromEntries(DEVICE_FIELDS.map((key) => [key, field(formData, key)])),
  );
}

function isUniqueClash(error: unknown, column?: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (!column || JSON.stringify(error.meta ?? {}).includes(column))
  );
}

/** True when the vendor exists, is active and does this kind of work. */
async function vendorOk(
  id: string | null | undefined,
  kinds: typeof SALES_KINDS,
) {
  if (!id) return true;
  const vendor = await db.vendor.findUnique({
    where: { id },
    select: { kind: true, active: true },
  });
  return Boolean(vendor && vendor.active && kinds.includes(vendor.kind));
}

/**
 * The asset tag for `employeeId` holding a device of `type`, skipping tags
 * other devices already use (`exceptDeviceId` is the device being moved).
 */
async function tagForHolder(
  type: DeviceType,
  employeeId: string,
  exceptDeviceId?: string,
) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { empId: true },
  });
  if (!employee) throw new Error("Employee not found");
  const base = `${assetTagPrefix(type)}${employee.empId.trim().toUpperCase()}`;
  const taken = await db.device.findMany({
    where: {
      assetTag: { startsWith: base, mode: "insensitive" },
      ...(exceptDeviceId ? { id: { not: exceptDeviceId } } : {}),
    },
    select: { assetTag: true },
  });
  return holderAssetTag(
    type,
    employee.empId,
    taken.map((row) => row.assetTag),
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
    select: {
      id: true,
      status: true,
      holderId: true,
      type: true,
      assetTag: true,
      stockTag: true,
      ...DEVICE_ACCESS_SELECT,
    },
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
    return invalid(parsed.error);
  if (!(await vendorOk(parsed.data.vendorId, SALES_KINDS)))
    return fieldError("vendorId", "Pick an active vendor that sells devices.");
  const employeeId = field(formData, "employeeId") || null;
  const conditionOut = field(formData, "conditionOut")?.trim() || null;

  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    // Numbered tags live in stockTag once a device is assigned.
    const prefix = assetTagPrefix(parsed.data.type);
    const existing = await db.device.findMany({
      where: {
        OR: [
          { assetTag: { startsWith: prefix } },
          { stockTag: { startsWith: prefix } },
        ],
      },
      select: { assetTag: true, stockTag: true },
    });
    const stockTag = nextAssetTag(
      parsed.data.type,
      existing.flatMap((row) => [row.assetTag, row.stockTag ?? ""]),
    );
    try {
      created = await db.device.create({
        data: {
          ...deviceData(parsed.data),
          stockTag,
          assetTag: employeeId
            ? await tagForHolder(parsed.data.type, employeeId)
            : stockTag,
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
        return fieldError("serialNumber", "Another device already has that serial number.");
      // Two devices added at once can draw the same tag; draw again.
      if (!isUniqueClash(error, "assetTag")) throw error;
    }
  }
  if (!created) return { error: "Couldn't allocate an asset tag. Try again." };
  // Arrived from a purchase request: close it against this device.
  const requestId = field(formData, "requestId");
  if (requestId) {
    await db.devicePurchaseRequest.updateMany({
      where: {
        id: requestId,
        status: { in: ["PENDING", "SENT"] },
        deviceId: null,
      },
      data: { status: "RECEIVED", deviceId: created.id },
    });
    revalidatePath("/devices/requests");
  }
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
    return invalid(parsed.error);
  if (!(await vendorOk(parsed.data.vendorId, SALES_KINDS)))
    return fieldError("vendorId", "Pick an active vendor that sells devices.");
  try {
    // The asset tag stays: it's printed on the label.
    const { type: _type, ...rest } = deviceData(parsed.data);
    void _type;
    await db.device.update({ where: { id }, data: rest });
  } catch (error) {
    if (isUniqueClash(error, "serialNumber"))
      return fieldError("serialNumber", "Another device already has that serial number.");
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
  if (!employeeId) return fieldError("employeeId", "Pick an employee.");
  const { user, device } = await requireDeviceAccess(deviceId, "manage");
  if (!canAssign(device.status))
    return { error: "Only devices in stock or assigned can be handed out." };
  if (device.holderId === employeeId)
    return { error: "They already have this device." };
  const now = new Date();
  const assetTag = await tagForHolder(device.type, employeeId, deviceId);
  try {
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
        // The tag follows the holder; stockTag remembers the numbered one.
        data: {
          holderId: employeeId,
          status: "ASSIGNED",
          assetTag,
          stockTag: stockTagOf(device),
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueClash(error, "assetTag"))
      return { error: "That tag was just taken by another device. Try again." };
    throw error;
  }
  revalidateDevice(deviceId);
  return { ok: `Assigned. Asset tag is now ${assetTag}; reprint the label.` };
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
      data: {
        holderId: null,
        status: "IN_STOCK",
        assetTag: stockTagOf(device),
        stockTag: stockTagOf(device),
      },
    }),
  ]);
  revalidateDevice(deviceId);
  return {
    ok: `Returned to stock as ${stockTagOf(device)}; reprint the label.`,
  };
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
      data: {
        status: status as (typeof RETIRE_TO)[number],
        holderId: null,
        assetTag: stockTagOf(device),
        stockTag: stockTagOf(device),
      },
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
    return invalid(parsed.error);
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
    data: {
      ticketId,
      fromStatus: from,
      toStatus: to,
      changedById: userId,
      note,
    },
  });
}

export async function sendForService(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const { user, device, ticket } = await requireTicket(
    field(formData, "ticketId") ?? "",
  );
  if (!canMoveTicket(ticket.status, "SENT_FOR_SERVICE"))
    return { error: "Only open issues can be sent for service." };
  if (device.status === "IN_SERVICE")
    return { error: "This device is already out for service." };
  const vendorId = field(formData, "serviceVendorId")?.trim();
  if (!vendorId)
    return fieldError("serviceVendorId", "Where is it going? Pick the service centre.");
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { name: true, kind: true, active: true },
  });
  if (!vendor || !vendor.active || !SERVICE_KINDS.includes(vendor.kind))
    return fieldError("serviceVendorId", "Pick an active vendor that services devices.");
  const expected = field(formData, "expectedBackOn")?.trim();
  if (expected && !/^\d{4}-\d{2}-\d{2}$/.test(expected))
    return fieldError("expectedBackOn", "Enter a valid date");
  const note = field(formData, "note")?.trim() || null;
  await db.$transaction([
    db.deviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: "SENT_FOR_SERVICE",
        serviceVendorId: vendorId,
        sentAt: new Date(),
        expectedBackOn: expected ? new Date(expected) : null,
      },
    }),
    db.device.update({
      where: { id: device.id },
      data: { status: "IN_SERVICE" },
    }),
    moveEvent(
      ticket.id,
      ticket.status,
      "SENT_FOR_SERVICE",
      user.id,
      note ?? `Sent to ${vendor.name}`,
    ),
  ]);
  revalidateDevice(device.id);
  return { ok: "Sent for service." };
}

export async function resolveTicket(
  _prev: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const { user, device, ticket } = await requireTicket(
    field(formData, "ticketId") ?? "",
  );
  if (!canMoveTicket(ticket.status, "RESOLVED"))
    return { error: "This issue is already closed." };
  const resolution = field(formData, "resolution")?.trim();
  if (!resolution) return fieldError("resolution", "Say how it was resolved.");
  const cost = field(formData, "cost")?.trim();
  if (cost && !/^\d+(\.\d{1,2})?$/.test(cost))
    return fieldError("cost", "Enter a number like 2500 or 2500.50");
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
  const { user, device, ticket } = await requireTicket(
    field(formData, "ticketId") ?? "",
  );
  if (!canMoveTicket(ticket.status, "CANCELLED")) return;
  await db.$transaction([
    db.deviceTicket.update({
      where: { id: ticket.id },
      data: { status: "CANCELLED" },
    }),
    moveEvent(ticket.id, ticket.status, "CANCELLED", user.id, null),
  ]);
  revalidateDevice(device.id);
}
