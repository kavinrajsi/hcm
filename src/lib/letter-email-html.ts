import { renderEmail, SIGNATURE_SLOT } from "@/lib/email-template";

// The full branded HTML of a letter email. Shared by the sender
// (letterEmail) and the editor's Preview tab so they can't drift apart.

/**
 * Older letters ended with "Regards, HR Team"; the email signature now
 * signs off, so a trailing one is dropped rather than signing twice.
 */
const OLD_SIGN_OFF = /\s*<p>\s*Regards,?\s*(?:<br\s*\/?>\s*)+HR Team\.?\s*<\/p>\s*$/i;

export function withoutOldSignOff(bodyHtml: string): string {
  return bodyHtml.replace(OLD_SIGN_OFF, "");
}

/**
 * Leaves the signature slot for sendEmail to fill. The editor's Preview
 * passes `signatureHtml` (from the server) to show the finished email.
 */
export function letterEmailHtml(subject: string, bodyHtml: string, signatureHtml?: string): string {
  const html = renderEmail({ preheader: subject, heading: subject, body: withoutOldSignOff(bodyHtml) });
  return signatureHtml === undefined ? html : html.replace(SIGNATURE_SLOT, signatureHtml);
}
