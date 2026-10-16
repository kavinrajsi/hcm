// Outbound email. All mail (letters, invites, password resets, reminders,
// exit clearance) goes through sendEmail so sender, logging and errors stay
// in one place. HR picks the service on Admin → Email templates: ZeptoMail's
// HTTP API (default, tracks opens and bounces) or any SMTP server such as a
// Zoho Mail mailbox (a fallback when ZeptoMail is out of credit or down).
// SMTP details are entered there too and kept in AppSetting, the password
// encrypted. Each email can override the default: another service, or
// "Don't send" (logged as not sent). No-ops with a console warning when the chosen service isn't
// set up (local dev).
//
// Env:
//   ZEPTOMAIL_TOKEN     Send Mail token ("Zoho-enczapikey …"; the prefix is
//                       added if you paste only the key)
//   ZEPTOMAIL_API_URL   optional, defaults to the Zoho endpoint below
//   EMAIL_FROM          sender, e.g. "HCM <noreply@madarth.com>"

import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { logEmail, type EmailKind } from "@/lib/email-log";
import { applySignature } from "@/lib/email-signature";

const DEFAULT_API_URL = "https://cpaas.zoho.com/v1.1/email";
const DEFAULT_FROM = "HCM <noreply@madarth.com>";

export const EMAIL_TRANSPORT_SETTING = "emailTransport";
export const EMAIL_SMTP_SETTING = "emailSmtp";
/** Per-email overrides: catalog key → transport or "off". Missing = default. */
export const EMAIL_ROUTING_SETTING = "emailRouting";
export const EMAIL_TRANSPORTS = ["zeptomail", "smtp"] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];
export const EMAIL_TRANSPORT_NAMES: Record<EmailTransport, string> = {
  zeptomail: "ZeptoMail",
  smtp: "SMTP",
};
export const EMAIL_ROUTES = ["default", ...EMAIL_TRANSPORTS, "off"] as const;
export type EmailRoute = (typeof EMAIL_ROUTES)[number];
/** Saved overrides only; "default" is never stored. */
export type EmailRouting = Partial<Record<string, Exclude<EmailRoute, "default">>>;
export const TURNED_OFF_REASON = "Turned off for this email on Admin → Email templates.";

/** Saved on Admin → Email templates. The password never leaves the server. */
export type SmtpSettings = {
  host: string;
  port: number;
  username: string;
  passwordEncrypted: string;
  fromAddress: string;
  fromName: string;
};

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

/** "Name <address>" or a bare address → ZeptoMail's { address, name }. */
export function parseSender(from: string): { address: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (match)
    return { address: match[2], ...(match[1] ? { name: match[1] } : {}) };
  return { address: from.trim() };
}

function authHeader(token: string): string {
  return /^Zoho-enczapikey\s/i.test(token) ? token : `Zoho-enczapikey ${token}`;
}

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Overrides EMAIL_FROM, e.g. "Madarth <noreply@madarth.com>". */
  from?: string;
  cc?: string[];
  /** Where replies go ("Name <address>" or a bare address). */
  replyTo?: string;
  /** Which email this is, for the Email log (template key). */
  kind: EmailKind;
  /** Email templates catalog key when it differs from `kind` (letters). */
  template?: string;
  /** The employee it's about, if any (links the log row). */
  employeeId?: string | null;
  /** The signed-in user who caused it, if any. */
  sentById?: string | null;
  /** Set by Resend: the log row this one re-sends. */
  resendOfId?: string;
};

/**
 * `reason` says why nothing was sent. `from` is the sender actually used
 * when the service rewrites it (SMTP sends from the saved address).
 */
type SendResult = { skipped: true; reason: string } | { skipped: false; id?: string; from?: string };

const NOT_SET_UP: Record<EmailTransport, string> = {
  zeptomail: "Email isn't set up (ZEPTOMAIL_TOKEN).",
  smtp: "SMTP isn't set up — add the details on Admin → Email templates.",
};

/** AppSetting value → transport; anything unknown means ZeptoMail. */
export function readEmailTransport(value: unknown): EmailTransport {
  const transport = (value as { transport?: unknown } | null)?.transport;
  return EMAIL_TRANSPORTS.includes(transport as EmailTransport) ? (transport as EmailTransport) : "zeptomail";
}

export async function currentEmailTransport(): Promise<EmailTransport> {
  const row = await db.appSetting.findUnique({ where: { key: EMAIL_TRANSPORT_SETTING } });
  return readEmailTransport(row?.value);
}

/** AppSetting value → SMTP settings, or null when missing or incomplete. */
export function readSmtpSettings(value: unknown): SmtpSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  const port = Number(raw.port);
  const settings = {
    host: text("host"),
    port,
    username: text("username"),
    passwordEncrypted: text("passwordEncrypted"),
    fromAddress: text("fromAddress"),
    fromName: text("fromName"),
  };
  const complete =
    settings.host && settings.username && settings.passwordEncrypted && settings.fromAddress &&
    Number.isInteger(port) && port > 0 && port < 65536;
  return complete ? settings : null;
}

export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const row = await db.appSetting.findUnique({ where: { key: EMAIL_SMTP_SETTING } });
  return readSmtpSettings(row?.value);
}

export async function isTransportReady(transport: EmailTransport): Promise<boolean> {
  if (transport === "smtp") return (await getSmtpSettings()) !== null;
  return Boolean(process.env.ZEPTOMAIL_TOKEN?.trim());
}

/** For admin screens: which service is chosen and which are set up (no values). */
export async function emailTransportStatus() {
  const [transport, zeptomail, smtp] = await Promise.all([
    currentEmailTransport(),
    isTransportReady("zeptomail"),
    isTransportReady("smtp"),
  ]);
  return { transport, configured: { zeptomail, smtp } satisfies Record<EmailTransport, boolean> };
}

/** AppSetting value → overrides, dropping anything unknown. */
export function readEmailRouting(value: unknown): EmailRouting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const routing: EmailRouting = {};
  for (const [key, route] of Object.entries(value))
    if (route === "off" || EMAIL_TRANSPORTS.includes(route as EmailTransport))
      routing[key] = route as Exclude<EmailRoute, "default">;
  return routing;
}

export async function getEmailRouting(): Promise<EmailRouting> {
  const row = await db.appSetting.findUnique({ where: { key: EMAIL_ROUTING_SETTING } });
  return readEmailRouting(row?.value);
}

/** This email's override, else the default service. */
export async function resolveTransport(options: Pick<SendEmailOptions, "kind" | "template">): Promise<EmailTransport | "off"> {
  const routing = await getEmailRouting();
  return routing[options.template ?? options.kind] ?? (await currentEmailTransport());
}

/** True when the chosen service can send right now. */
export async function isEmailReady(): Promise<boolean> {
  return isTransportReady(await currentEmailTransport());
}

/**
 * Sends and records the attempt in the Email log (sent, failed or not
 * sent). Logging never changes the outcome: a failed send still throws.
 */
export async function sendEmail(input: SendEmailOptions): Promise<SendResult> {
  // Signed first, so the log keeps exactly what the recipient got.
  const options = { ...input, html: await applySignature(input.html) };
  const transport = await resolveTransport(options);
  if (transport === "off") {
    await logEmail(options, { status: "NOT_SENT", provider: "off", error: TURNED_OFF_REASON });
    return { skipped: true, reason: TURNED_OFF_REASON };
  }
  let result: SendResult;
  try {
    result = transport === "smtp" ? await deliverSmtp(options) : await deliverZeptoMail(options);
  } catch (error) {
    await logEmail(options, { status: "FAILED", provider: transport, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  await logEmail(
    options,
    result.skipped
      ? { status: "NOT_SENT", provider: transport, error: result.reason }
      : { status: "SENT", provider: transport, providerId: result.id, from: result.from },
  );
  return result;
}

export function senderOf(options: Pick<SendEmailOptions, "from">): string {
  return options.from || process.env.EMAIL_FROM || DEFAULT_FROM;
}

async function deliverZeptoMail(options: SendEmailOptions): Promise<SendResult> {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  if (!token) {
    console.warn(`[email] ZEPTOMAIL_TOKEN unset; skipped: ${options.subject}`);
    return { skipped: true as const, reason: NOT_SET_UP.zeptomail };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const replyTo = options.replyTo ? parseSender(options.replyTo) : null;
  const body = {
    from: parseSender(senderOf(options)),
    to: recipients.map((address) => ({ email_address: { address } })),
    // ZeptoMail: cc like `to`; reply_to is a flat { address, name } list.
    ...(options.cc?.length
      ? { cc: options.cc.map((address) => ({ email_address: { address } })) }
      : {}),
    ...(replyTo ? { reply_to: [replyTo] } : {}),
    subject: options.subject,
    htmlbody: options.html,
    ...(options.attachments?.length
      ? {
          attachments: options.attachments.map((attachment) => ({
            name: attachment.filename,
            content: attachment.content.toString("base64"),
            mime_type:
              MIME_TYPES[
                attachment.filename.split(".").pop()?.toLowerCase() ?? ""
              ] ?? "application/octet-stream",
          })),
        }
      : {}),
  };

  const response = await fetch(
    process.env.ZEPTOMAIL_API_URL || DEFAULT_API_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authHeader(token),
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await response.json().catch(() => null)) as {
    request_id?: string;
    message?: string;
    error?: { message?: string; details?: { message?: string }[] };
  } | null;
  if (!response.ok) {
    const detail =
      data?.error?.details?.[0]?.message ??
      data?.error?.message ??
      response.status;
    throw new Error(`Email send failed: ${detail}`);
  }
  return { skipped: false as const, id: data?.request_id };
}

/**
 * The saved address always (SMTP servers like Zoho refuse others), named
 * as the email asks ("HCM", "Madarth") or else with the saved name.
 */
export function smtpSender(options: Pick<SendEmailOptions, "from">, settings: SmtpSettings): string {
  const name = parseSender(senderOf(options)).name || settings.fromName;
  return name ? `${name} <${settings.fromAddress}>` : settings.fromAddress;
}

async function deliverSmtp(options: SendEmailOptions): Promise<SendResult> {
  const settings = await getSmtpSettings();
  if (!settings) {
    console.warn(`[email] SMTP not set up; skipped: ${options.subject}`);
    return { skipped: true as const, reason: NOT_SET_UP.smtp };
  }
  let password: string;
  try {
    password = decryptField(settings.passwordEncrypted);
  } catch {
    throw new Error("Email send failed: the saved SMTP password can't be read — enter it again on Admin → Email templates.");
  }
  const from = smtpSender(options, settings);
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // 465 is SSL from the start; 587 upgrades with STARTTLS.
    secure: settings.port === 465,
    auth: { user: settings.username, pass: password },
  });
  try {
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      ...(options.cc?.length ? { cc: options.cc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      subject: options.subject,
      html: options.html,
      ...(options.attachments?.length
        ? { attachments: options.attachments.map(({ filename, content }) => ({ filename, content })) }
        : {}),
    });
    return { skipped: false as const, id: info.messageId, from };
  } catch (error) {
    throw new Error(`Email send failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    transporter.close();
  }
}
