// Thin ZeptoMail (Zoho) wrapper. All outbound mail (letters, invites,
// password resets, probation reminders, exit clearance) goes through
// sendEmail so sender and error handling stay in one place. No-ops with a
// console warning when ZEPTOMAIL_TOKEN is unset (local dev without email).
//
// Env:
//   ZEPTOMAIL_TOKEN    Send Mail token ("Zoho-enczapikey …"; the prefix is
//                      added if you paste only the key)
//   ZEPTOMAIL_API_URL  optional, defaults to the Zoho endpoint below
//   EMAIL_FROM         sender, e.g. "HCM <noreply@madarth.com>"

const DEFAULT_API_URL = "https://cpaas.zoho.com/v1.1/email";
const DEFAULT_FROM = "HCM <noreply@madarth.com>";

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
  const m = from.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (m) return { address: m[2], ...(m[1] ? { name: m[1] } : {}) };
  return { address: from.trim() };
}

function authHeader(token: string): string {
  return /^Zoho-enczapikey\s/i.test(token) ? token : `Zoho-enczapikey ${token}`;
}

export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  if (!token) {
    console.warn(`[email] ZEPTOMAIL_TOKEN unset; skipped: ${options.subject}`);
    return { skipped: true as const };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const body = {
    from: parseSender(process.env.EMAIL_FROM || DEFAULT_FROM),
    to: recipients.map((address) => ({ email_address: { address } })),
    subject: options.subject,
    htmlbody: options.html,
    ...(options.attachments?.length
      ? {
          attachments: options.attachments.map((a) => ({
            name: a.filename,
            content: a.content.toString("base64"),
            mime_type:
              MIME_TYPES[a.filename.split(".").pop()?.toLowerCase() ?? ""] ??
              "application/octet-stream",
          })),
        }
      : {}),
  };

  const res = await fetch(process.env.ZEPTOMAIL_API_URL || DEFAULT_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(token),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as {
    request_id?: string;
    message?: string;
    error?: { message?: string; details?: { message?: string }[] };
  } | null;
  if (!res.ok) {
    const detail =
      data?.error?.details?.[0]?.message ?? data?.error?.message ?? res.status;
    throw new Error(`Email send failed: ${detail}`);
  }
  return { skipped: false as const, id: data?.request_id };
}
