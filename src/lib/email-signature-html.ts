// The email signature's settings and HTML, with no database access so the
// Signature form's live preview can use it in the browser. Loading and
// applying the saved one is in email-signature.ts.

import { appUrl, escapeHtml, SIGNATURE_SLOT } from "@/lib/email-template";

export const EMAIL_SIGNATURE_SETTING = "emailSignature";
export const DEFAULT_LOGO_PATH = "/email/madarth-logo.png";
export const UPLOADED_LOGO_PATH = "/api/email-logo";

export type EmailSignature = {
  enabled: boolean;
  closing: string;
  name: string;
  website: string;
  address: string;
  /** Private Blob pathname of HR's logo; null uses the bundled one. */
  logoPathname: string | null;
};

export const DEFAULT_SIGNATURE: EmailSignature = {
  enabled: true,
  closing: "Regards,",
  name: "Kavinraj Ilangovan",
  website: "www.madarth.com",
  address: "#4, Alamelumangapuram,\nMylapore Chennai 4",
  logoPathname: null,
};

/** AppSetting value → signature; missing fields fall back to the defaults. */
export function readSignature(value: unknown): EmailSignature {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_SIGNATURE;
  const raw = value as Record<string, unknown>;
  const text = (key: keyof EmailSignature) =>
    typeof raw[key] === "string" ? (raw[key] as string).trim() : (DEFAULT_SIGNATURE[key] as string);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SIGNATURE.enabled,
    closing: text("closing"),
    name: text("name"),
    website: text("website"),
    address: text("address"),
    logoPathname: typeof raw.logoPathname === "string" && raw.logoPathname ? raw.logoPathname : null,
  };
}

/** Site-relative logo path; the pathname in the query busts mail-client caches when HR swaps logos. */
export function logoPath(signature: Pick<EmailSignature, "logoPathname">): string {
  return signature.logoPathname
    ? `${UPLOADED_LOGO_PATH}?v=${encodeURIComponent(signature.logoPathname.slice(-12))}`
    : DEFAULT_LOGO_PATH;
}

/** Absolute, for real emails; the admin's live preview passes its own `src`. */
export function logoUrl(signature: Pick<EmailSignature, "logoPathname">): string {
  return appUrl(logoPath(signature));
}

const lines = (value: string) => value.split(/\r?\n/).map(escapeHtml).join("<br>");
const href = (website: string) => (/^https?:\/\//i.test(website) ? website : `https://${website}`);

/** Email-safe HTML (tables, inline styles); empty when turned off. */
export function signatureHtml(signature: EmailSignature, options: { logoSrc?: string } = {}): string {
  if (!signature.enabled) return "";
  const label = (text: string) =>
    `<td style="padding:0 12px 4px 0;font-size:13px;line-height:20px;color:#a1a1aa;vertical-align:top;white-space:nowrap">${text}</td>`;
  const value = (html: string) => `<td style="padding:0 0 4px;font-size:13px;line-height:20px;color:#3f3f46">${html}</td>`;
  const details = [
    signature.website &&
      `<tr>${label("website")}${value(`<a href="${escapeHtml(href(signature.website))}" style="color:#3f3f46;text-decoration:underline">${escapeHtml(signature.website)}</a>`)}</tr>`,
    signature.address && `<tr>${label("address")}${value(lines(signature.address))}</tr>`,
  ].filter(Boolean);
  const closing = [signature.closing, signature.name].filter(Boolean).map(lines).join("<br>");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;margin-top:8px">
  ${closing ? `<tr><td style="padding:16px 0 12px;font-size:15px;line-height:24px;color:#3f3f46">${closing}</td></tr>` : ""}
  ${details.length ? `<tr><td style="padding-bottom:12px"><table role="presentation" cellpadding="0" cellspacing="0">${details.join("")}</table></td></tr>` : ""}
  <tr><td><img src="${escapeHtml(options.logoSrc ?? logoUrl(signature))}" width="175" height="30" alt="Madarth" style="display:block;border:0;outline:none;text-decoration:none"></td></tr>
</table>`;
}

/** Fills renderEmail's slot (or drops it when the signature is off). */
export function fillSignature(html: string, signature: EmailSignature): string {
  return html.replace(SIGNATURE_SLOT, signatureHtml(signature));
}
