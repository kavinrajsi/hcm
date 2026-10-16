"use server";

// Admin → Email templates: which service sends HCM's email by default,
// per-email overrides (another service or "Don't send"), the SMTP details
// for the SMTP option, the signature every email ends with, and a test send
// to prove it works. The SMTP
// password is stored encrypted and never sent back to the browser.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { deleteDocument, uploadDocument } from "@/lib/blob";
import { EMAIL_SIGNATURE_SETTING, getSignature } from "@/lib/email-signature";
import { requireRole } from "@/lib/rbac";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { emailCatalog } from "@/lib/email-catalog";
import {
  currentEmailTransport,
  EMAIL_ROUTES,
  EMAIL_ROUTING_SETTING,
  EMAIL_SMTP_SETTING,
  EMAIL_TRANSPORT_NAMES,
  EMAIL_TRANSPORT_SETTING,
  EMAIL_TRANSPORTS,
  getEmailRouting,
  getSmtpSettings,
  isTransportReady,
  type EmailRouting,
  sendEmail,
} from "@/lib/email";
import { testEmail } from "@/lib/emails";

const NOT_SET_UP: Record<(typeof EMAIL_TRANSPORTS)[number], string> = {
  zeptomail: "ZeptoMail isn't set up on the server (ZEPTOMAIL_TOKEN).",
  smtp: "Add the SMTP details first.",
};

const transportSchema = z.object({
  transport: z.enum(EMAIL_TRANSPORTS, "Pick a sending service."),
});

export async function saveEmailTransport(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = transportSchema.safeParse({ transport: formData.get("transport") });
  if (!parsed.success) return invalid(parsed.error);
  const { transport } = parsed.data;
  // Switching to a service with no credentials would silently stop all email.
  if (!(await isTransportReady(transport))) return fieldError("transport", NOT_SET_UP[transport]);
  const value = { transport };
  await db.appSetting.upsert({
    where: { key: EMAIL_TRANSPORT_SETTING },
    create: { key: EMAIL_TRANSPORT_SETTING, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });
  revalidatePath("/email-templates");
  return { ok: `Saved. HCM now sends email through ${EMAIL_TRANSPORT_NAMES[transport]}.` };
}

const smtpSchema = z.object({
  host: z.string().trim().min(1, "Enter the SMTP server, e.g. smtppro.zoho.com."),
  port: z.coerce
    .number("Enter a port number.")
    .int("Enter a whole number.")
    .min(1, "Ports run from 1 to 65535.")
    .max(65535, "Ports run from 1 to 65535."),
  username: z.string().trim().min(1, "Enter the login, usually the mailbox address."),
  password: z.string(),
  fromAddress: z.string().trim().pipe(z.email("Enter the address mail is sent from.")),
  fromName: z.string().trim().max(60, "Keep the name under 60 characters."),
});

export async function saveSmtpSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = smtpSchema.safeParse({
    host: formData.get("host") ?? "",
    port: formData.get("port") || 465,
    username: formData.get("username") ?? "",
    password: formData.get("password") ?? "",
    fromAddress: formData.get("fromAddress") ?? "",
    fromName: formData.get("fromName") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { password, ...details } = parsed.data;
  // A blank password keeps the saved one, so HR can edit the rest freely.
  const saved = await getSmtpSettings();
  if (!password && !saved) return fieldError("password", "Enter the password (for Zoho, an app-specific password).");
  const value = { ...details, passwordEncrypted: password ? encryptField(password) : saved!.passwordEncrypted };
  await db.appSetting.upsert({
    where: { key: EMAIL_SMTP_SETTING },
    create: { key: EMAIL_SMTP_SETTING, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });
  revalidatePath("/email-templates");
  return { ok: "Saved." };
}

const routeSchema = z.enum(EMAIL_ROUTES, "Pick how this email is sent.");

/** One select per catalog email, named `route.<key>`. Only overrides are stored. */
export async function saveEmailRouting(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const keys = (await emailCatalog()).map((email) => email.key);
  const routing: EmailRouting = {};
  const fieldErrors: Record<string, string[]> = {};
  const ready = { zeptomail: await isTransportReady("zeptomail"), smtp: await isTransportReady("smtp") };
  for (const key of keys) {
    const parsed = routeSchema.safeParse(formData.get(`route.${key}`) ?? "default");
    if (!parsed.success) {
      fieldErrors[`route.${key}`] = [parsed.error.issues[0].message];
      continue;
    }
    const route = parsed.data;
    if (route === "default") continue;
    if (route !== "off" && !ready[route]) {
      fieldErrors[`route.${key}`] = [NOT_SET_UP[route]];
      continue;
    }
    routing[key] = route;
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Fix the highlighted emails." };
  await db.appSetting.upsert({
    where: { key: EMAIL_ROUTING_SETTING },
    create: { key: EMAIL_ROUTING_SETTING, value: routing, updatedById: user.id },
    update: { value: routing, updatedById: user.id },
  });
  revalidatePath("/email-templates");
  return { ok: "Saved." };
}

export async function removeSmtpSettings(): Promise<FormState> {
  await requireRole("HR_ADMIN");
  if ((await currentEmailTransport()) === "smtp")
    return { error: "HCM is sending through SMTP. Switch to ZeptoMail first." };
  const routing = await getEmailRouting();
  const usingSmtp = (await emailCatalog()).filter((email) => routing[email.key] === "smtp").map((email) => email.name);
  if (usingSmtp.length)
    return { error: `These emails are set to SMTP: ${usingSmtp.join(", ")}. Change them first.` };
  await db.appSetting.deleteMany({ where: { key: EMAIL_SMTP_SETTING } });
  revalidatePath("/email-templates");
  return { ok: "Removed." };
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const LOGO_MAX_BYTES = 300 * 1024;

const signatureSchema = z.object({
  enabled: z.boolean(),
  closing: z.string().trim().max(40, "Keep the closing under 40 characters."),
  name: z.string().trim().max(80, "Keep the name under 80 characters."),
  website: z.string().trim().max(100, "Keep the website under 100 characters."),
  address: z.string().trim().max(200, "Keep the address under 200 characters."),
});

/** The sign-off on every email. A new logo replaces the old one in Blob. */
export async function saveSignature(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = signatureSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    closing: formData.get("closing") ?? "",
    name: formData.get("name") ?? "",
    website: formData.get("website") ?? "",
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const logo = formData.get("logo");
  const file = logo instanceof File && logo.size > 0 ? logo : null;
  if (file && !LOGO_TYPES[file.type]) return fieldError("logo", "Use a PNG or JPG image.");
  if (file && file.size > LOGO_MAX_BYTES) return fieldError("logo", "Keep the logo under 300 KB.");

  const saved = await getSignature();
  let logoPathname = formData.get("defaultLogo") === "on" ? null : saved.logoPathname;
  if (file) logoPathname = await uploadDocument(`email/signature-logo.${LOGO_TYPES[file.type]}`, file);
  const value = { ...parsed.data, logoPathname };
  await db.appSetting.upsert({
    where: { key: EMAIL_SIGNATURE_SETTING },
    create: { key: EMAIL_SIGNATURE_SETTING, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });
  // Old logo only after the new setting is saved; a leftover file is harmless.
  if (saved.logoPathname && saved.logoPathname !== logoPathname)
    await deleteDocument(saved.logoPathname).catch((error) => console.error("[email-signature] old logo", error));
  revalidatePath("/email-templates");
  revalidatePath("/letters");
  return { ok: "Saved." };
}

/** Sends a short test to the signed-in admin through the saved service. */
export async function sendTestEmail(): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const service = EMAIL_TRANSPORT_NAMES[await currentEmailTransport()];
  try {
    const result = await sendEmail({ kind: "test", to: user.email, sentById: user.id, ...testEmail({ service }) });
    if (result.skipped) return { error: result.reason };
    return { ok: `Test email sent to ${user.email} through ${service}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Email send failed." };
  }
}
