// The sign-off at the end of every HCM email (Admin → Email templates →
// Signature). renderEmail leaves SIGNATURE_SLOT in each email; sendEmail and
// the previews fill it here, so builders stay synchronous and the Email log
// keeps exactly what was sent. The logo must be a public https image for
// mail clients: the bundled default, or HR's upload served by
// /api/email-logo.

import { db } from "@/lib/db";
import { SIGNATURE_SLOT } from "@/lib/email-template";
import { EMAIL_SIGNATURE_SETTING, fillSignature, readSignature, type EmailSignature } from "@/lib/email-signature-html";

export * from "@/lib/email-signature-html";

export async function getSignature(): Promise<EmailSignature> {
  const row = await db.appSetting.findUnique({ where: { key: EMAIL_SIGNATURE_SETTING } });
  return readSignature(row?.value);
}

export async function applySignature(html: string): Promise<string> {
  return html.includes(SIGNATURE_SLOT) ? fillSignature(html, await getSignature()) : html;
}
