import { z } from "zod";
import type { DeviceOs, DeviceType } from "@/generated/prisma/enums";
import { osSuffix } from "@/lib/devices/os";
import { escapeHtml, renderEmail } from "@/lib/email-template";
import { formatDay } from "@/lib/format-date";
import { DEVICE_TYPE_LABELS } from "@/lib/devices/devices";

// Device purchase requests emailed to vendors: who the mail comes from,
// who's copied, and what it says. The CC list and reply-to are HR-editable
// (AppSetting "devicePurchaseEmail"); these are the starting values.

export const PURCHASE_EMAIL_SETTING = "devicePurchaseEmail";
export const PURCHASE_EMAIL_FROM = "Madarth <noreply@madarth.com>";

export type PurchaseEmailSettings = { replyTo: string; cc: string[] };

export const DEFAULT_PURCHASE_EMAIL: PurchaseEmailSettings = {
  replyTo: "admin@madarth.com",
  cc: ["admin@madarth.com", "hr@madarth.com", "finance@madarth.com"],
};

const emailAddress = z.email();

/**
 * Splits a typed list (commas, semicolons, spaces or new lines) into
 * lower-cased, de-duplicated addresses, or reports the first bad one.
 */
export function parseEmailList(
  input: string,
): { ok: true; emails: string[] } | { ok: false; error: string } {
  const parts = input
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const part of parts) {
    if (!emailAddress.safeParse(part).success)
      return { ok: false, error: `"${part}" isn't a valid email address` };
  }
  return { ok: true, emails: [...new Set(parts)] };
}

/** Stored settings with defaults filled in; ignores malformed values. */
export function readPurchaseEmailSettings(value: unknown): PurchaseEmailSettings {
  const parsed = z
    .object({ replyTo: z.email(), cc: z.array(z.email()) })
    .safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PURCHASE_EMAIL;
}

export type PurchaseRequestInput = {
  vendorName: string;
  /** The person the email greets, if it goes to someone by name. */
  contactName: string | null;
  type: DeviceType;
  os?: DeviceOs | null;
  itemName: string;
  quantity: number;
  neededBy: Date | null;
  notes: string | null;
  replyTo: string;
};

export function purchaseRequestSubject(input: Pick<PurchaseRequestInput, "itemName" | "quantity">) {
  return `Device request from Madarth: ${input.quantity} × ${input.itemName}`;
}

/**
 * The vendor email. Says what's wanted, how many and by when, and asks for
 * price and availability. No employee details: the vendor doesn't need them.
 */
export function purchaseRequestEmail(input: PurchaseRequestInput): { subject: string; html: string } {
  const greeting = input.contactName ? `Hi ${escapeHtml(input.contactName)},` : "Hello,";
  const rows: [string, string][] = [
    ["Device", `${escapeHtml(DEVICE_TYPE_LABELS[input.type] + osSuffix(input.os))}: ${escapeHtml(input.itemName)}`],
    ["Quantity", String(input.quantity)],
    ...(input.neededBy ? ([["Needed by", formatDay(input.neededBy)]] as [string, string][]) : []),
  ];
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#71717a;vertical-align:top">${label}</td><td style="padding:4px 0;font-weight:600">${value}</td></tr>`,
    )
    .join("")}</table>`;
  const notes = input.notes
    ? `<p style="margin:12px 0 0">${escapeHtml(input.notes).replace(/\n/g, "<br>")}</p>`
    : "";
  return {
    subject: purchaseRequestSubject(input),
    html: renderEmail({
      brand: "Madarth",
      preheader: `Request for ${input.quantity} × ${input.itemName}`,
      heading: "Device request",
      body: `<p style="margin:0">${greeting}</p>
<p style="margin:12px 0 0">Madarth would like to buy the following. Please reply with the price, availability and delivery time.</p>
${table}${notes}
<p style="margin:12px 0 0">Thank you,<br>Madarth</p>`,
      footer: `Please reply to this email; replies go to <a href="mailto:${escapeHtml(input.replyTo)}" style="color:#71717a">${escapeHtml(input.replyTo)}</a>.`,
    }),
  };
}

/** Distinct type/brand/model a vendor has sold before, most recent first. */
export function vendorCatalog(
  devices: { type: DeviceType; brand: string; model: string }[],
): { type: DeviceType; name: string }[] {
  const seen = new Set<string>();
  const items: { type: DeviceType; name: string }[] = [];
  for (const device of devices) {
    const name = `${device.brand} ${device.model}`.trim();
    const key = `${device.type}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ type: device.type, name });
  }
  return items;
}

export type Recipient = { key: string; label: string; email: string; name: string | null };

/**
 * Who a vendor's purchase email can go to: each contact with an email
 * (primary first), then the company email. The first is the default.
 */
export function vendorRecipients(vendor: {
  email: string | null;
  contacts: { id: string; name: string; role: string | null; email: string | null; isPrimary: boolean; position: number }[];
}): Recipient[] {
  const people = [...vendor.contacts]
    .filter((contact) => contact.email)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)
    .map((contact) => ({
      key: contact.id,
      label: `${contact.name}${contact.role ? ` (${contact.role})` : ""} · ${contact.email}`,
      email: contact.email!,
      name: contact.name,
    }));
  const company = vendor.email
    ? [{ key: "company", label: `Company email · ${vendor.email}`, email: vendor.email, name: null }]
    : [];
  return [...people, ...company];
}
