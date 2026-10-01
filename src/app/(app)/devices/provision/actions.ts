"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { DEVICE_TYPES } from "@/lib/devices/devices";
import { DEVICE_OSES, LAPTOP_OS_SETTING } from "@/lib/devices/os";
import { SALES_KINDS } from "@/lib/devices/vendors";
import {
  PURCHASE_EMAIL_FROM,
  PURCHASE_EMAIL_SETTING,
  parseEmailList,
  purchaseRequestEmail,
  readPurchaseEmailSettings,
  vendorRecipients,
} from "@/lib/devices/purchase";

// Ordering a device from a vendor for a new joiner: preview the email,
// then send it. The request is saved before sending so a failed send can
// be retried, and a client key stops a double click sending twice.

async function emailSettings() {
  const row = await db.appSetting.findUnique({ where: { key: PURCHASE_EMAIL_SETTING } });
  return readPurchaseEmailSettings(row?.value);
}

const requestSchema = z.object({
  employeeId: z.string().trim().optional().transform((value) => value || null),
  vendorId: z.string().trim().min(1, "Pick a vendor."),
  type: z.enum(DEVICE_TYPES),
  os: z
    .enum(DEVICE_OSES)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value) => value ?? null),
  itemName: z.string().trim().min(2, "Say which device to buy.").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100),
  neededBy: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Needed-by must be a date")
    .transform((value) => (value ? new Date(value) : null)),
  notes: z.string().trim().max(1000).optional().transform((value) => value || null),
});

function readForm(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : undefined;
  };
  return requestSchema.safeParse({
    employeeId: value("employeeId"),
    vendorId: value("vendorId"),
    type: value("type"),
    os: value("os"),
    itemName: value("itemName"),
    quantity: value("quantity"),
    neededBy: value("neededBy"),
    notes: value("notes"),
  });
}

/** The vendor's chosen recipient (default: the first available). */
function pickRecipient(
  vendor: NonNullable<Awaited<ReturnType<typeof purchasableVendor>>>,
  key: FormDataEntryValue | null,
) {
  const recipients = vendorRecipients(vendor);
  return recipients.find((recipient) => recipient.key === key) ?? recipients[0] ?? null;
}

/** The vendor, if it can be emailed for a purchase. */
async function purchasableVendor(id: string) {
  const vendor = await db.vendor.findUnique({
    where: { id },
    select: {
      name: true,
      email: true,
      kind: true,
      active: true,
      contacts: {
        select: { id: true, name: true, role: true, email: true, isPrimary: true, position: true },
      },
    },
  });
  if (!vendor || !vendor.active || !SALES_KINDS.includes(vendor.kind)) return null;
  return vendor;
}

export type EmailPreview = {
  from: string;
  to: string;
  cc: string[];
  replyTo: string;
  subject: string;
  html: string;
};

export type PreviewState = { error?: string; preview?: EmailPreview };

/** Exactly what will be sent, for the confirm step. Sends nothing. */
export async function previewPurchaseRequest(formData: FormData): Promise<PreviewState> {
  await requireRole("HR_ADMIN");
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const vendor = await purchasableVendor(parsed.data.vendorId);
  if (!vendor) return { error: "Pick an active vendor that sells devices." };
  const recipient = pickRecipient(vendor, formData.get("recipient"));
  if (!recipient)
    return { error: `${vendor.name} has no email address. Add one on the vendor page first.` };
  const settings = await emailSettings();
  const { subject, html } = purchaseRequestEmail({
    vendorName: vendor.name,
    contactName: recipient.name,
    ...parsed.data,
    replyTo: settings.replyTo,
  });
  return {
    preview: {
      from: PURCHASE_EMAIL_FROM,
      to: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
      cc: settings.cc,
      replyTo: settings.replyTo,
      subject,
      html,
    },
  };
}

export type SendState = { error?: string; ok?: string; requestId?: string };

/** Emails a saved request; marks it sent, or records why it wasn't. */
async function deliver(requestId: string): Promise<SendState> {
  const request = await db.devicePurchaseRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { vendor: { select: { name: true } } },
  });
  const { html } = purchaseRequestEmail({
    vendorName: request.vendor.name,
    contactName: request.contactName,
    type: request.type,
    os: request.os,
    itemName: request.itemName,
    quantity: request.quantity,
    neededBy: request.neededBy,
    notes: request.notes,
    replyTo: request.emailReplyTo,
  });
  try {
    const result = await sendEmail({
      from: PURCHASE_EMAIL_FROM,
      to: request.emailTo,
      cc: request.emailCc,
      replyTo: request.emailReplyTo,
      subject: request.emailSubject,
      html,
    });
    if (result.skipped) {
      await db.devicePurchaseRequest.update({
        where: { id: requestId },
        data: { sendError: "Email isn't configured on this server (ZEPTOMAIL_TOKEN unset)." },
      });
      return { error: "Saved, but email isn't configured here, so nothing was sent.", requestId };
    }
    await db.devicePurchaseRequest.update({
      where: { id: requestId },
      data: { status: "SENT", sentAt: new Date(), emailId: result.id ?? null, sendError: null },
    });
    return { ok: `Sent to ${request.emailTo}.`, requestId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    await db.devicePurchaseRequest.update({
      where: { id: requestId },
      data: { sendError: message },
    });
    return { error: `Saved, but the email failed: ${message}. You can retry.`, requestId };
  }
}

function revalidateRequests(employeeId: string | null) {
  revalidatePath("/devices/requests");
  if (employeeId) revalidatePath(`/devices/provision/${employeeId}`);
}

export async function sendPurchaseRequest(formData: FormData): Promise<SendState> {
  const user = await requireRole("HR_ADMIN");
  if (formData.get("confirmed") !== "yes")
    return { error: "Confirm the email before it's sent." };
  const key = formData.get("requestKey");
  if (typeof key !== "string" || !/^[\w-]{10,64}$/.test(key))
    return { error: "Refresh the page and try again." };
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const vendor = await purchasableVendor(parsed.data.vendorId);
  const recipient = vendor ? pickRecipient(vendor, formData.get("recipient")) : null;
  if (!vendor || !recipient)
    return { error: "Pick an active vendor that sells devices and has an email." };
  const settings = await emailSettings();
  const { subject } = purchaseRequestEmail({
    vendorName: vendor.name,
    contactName: recipient.name,
    ...parsed.data,
    replyTo: settings.replyTo,
  });

  // The client key is the row id: a second click finds the row and stops.
  const data: Prisma.DevicePurchaseRequestUncheckedCreateInput = {
    id: key,
    ...parsed.data,
    emailTo: recipient.email,
    contactName: recipient.name,
    emailCc: settings.cc,
    emailReplyTo: settings.replyTo,
    emailSubject: subject,
    requestedById: user.id,
  };
  const created = await db.devicePurchaseRequest.createMany({ data: [data], skipDuplicates: true });
  if (created.count === 0) return { error: "This request was already sent.", requestId: key };

  const state = await deliver(key);
  revalidateRequests(parsed.data.employeeId);
  return state;
}

/** Resend a request whose email failed. Claims it first so it sends once. */
export async function retryPurchaseRequest(formData: FormData): Promise<SendState> {
  await requireRole("HR_ADMIN");
  if (formData.get("confirmed") !== "yes")
    return { error: "Confirm the email before it's sent." };
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Missing request" };
  const claimed = await db.devicePurchaseRequest.updateMany({
    where: { id, status: "PENDING", sendError: { not: null } },
    data: { sendError: null },
  });
  if (claimed.count === 0) return { error: "Nothing to retry." };
  const state = await deliver(id);
  const request = await db.devicePurchaseRequest.findUnique({ where: { id }, select: { employeeId: true } });
  revalidateRequests(request?.employeeId ?? null);
  return state;
}

export async function cancelPurchaseRequest(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const request = await db.devicePurchaseRequest.update({
    where: { id, status: { in: ["PENDING", "SENT"] } },
    data: { status: "CANCELLED" },
    select: { employeeId: true },
  });
  revalidateRequests(request.employeeId);
}

export type SettingsState = { error?: string; ok?: string };

export async function savePurchaseEmailSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireRole("HR_ADMIN");
  const replyTo = parseEmailList(String(formData.get("replyTo") ?? ""));
  if (!replyTo.ok) return { error: `Reply-to: ${replyTo.error}` };
  if (replyTo.emails.length !== 1) return { error: "Reply-to must be exactly one address." };
  const cc = parseEmailList(String(formData.get("cc") ?? ""));
  if (!cc.ok) return { error: `CC: ${cc.error}` };
  const value = { replyTo: replyTo.emails[0], cc: cc.emails };
  await db.appSetting.upsert({
    where: { key: PURCHASE_EMAIL_SETTING },
    create: { key: PURCHASE_EMAIL_SETTING, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });
  revalidatePath("/devices/settings");
  return { ok: "Saved." };
}

/** Saves which laptop OS each designation usually gets. */
export async function saveLaptopOsMap(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireRole("HR_ADMIN");
  const map: Record<string, (typeof DEVICE_OSES)[number]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("os:") || typeof value !== "string" || !value) continue;
    const designation = key.slice(3).trim();
    if (!designation || !(DEVICE_OSES as readonly string[]).includes(value)) continue;
    map[designation] = value as (typeof DEVICE_OSES)[number];
  }
  const extra = String(formData.get("newDesignation") ?? "").trim();
  const extraOs = String(formData.get("newOs") ?? "");
  if (extra && (DEVICE_OSES as readonly string[]).includes(extraOs))
    map[extra] = extraOs as (typeof DEVICE_OSES)[number];
  await db.appSetting.upsert({
    where: { key: LAPTOP_OS_SETTING },
    create: { key: LAPTOP_OS_SETTING, value: map, updatedById: user.id },
    update: { value: map, updatedById: user.id },
  });
  revalidatePath("/devices/settings");
  return { ok: "Saved." };
}

