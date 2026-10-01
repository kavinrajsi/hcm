// One branded, mobile-friendly layout for every email HCM sends. Table-based
// with inline styles because many mail clients ignore <style> blocks.
// Interpolate user data through escapeHtml; `html` parts are trusted markup.

const BRAND = "HCM · Madarth";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Absolute app URL for links in emails. */
export function appUrl(path = "/"): string {
  const base =
    process.env.AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return new URL(path, base).toString();
}

export function renderEmail({
  preheader,
  heading,
  body,
  button,
  footnote,
  footer,
  brand,
}: {
  /** Inbox preview text. */
  preheader: string;
  heading: string;
  /** Trusted HTML (escape any user data first). */
  body: string;
  button?: { label: string; url: string };
  /** Small print under the button, trusted HTML. */
  footnote?: string;
  /** Replaces the "automated message" line, trusted HTML. */
  footer?: string;
  /** Replaces the "HCM · Madarth" header, plain text. */
  brand?: string;
}): string {
  const cta = button
    ? `<tr><td style="padding:8px 0 24px">
         <a href="${escapeHtml(button.url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapeHtml(button.label)}</a>
       </td></tr>
       <tr><td style="font-size:12px;line-height:18px;color:#71717a;padding-bottom:16px">
         Button not working? Copy this link into your browser:<br>
         <span style="word-break:break-all;color:#3f3f46">${escapeHtml(button.url)}</span>
       </td></tr>`
    : "";
  const small = footnote
    ? `<tr><td style="font-size:13px;line-height:20px;color:#71717a;padding-top:8px">${footnote}</td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 4px 12px;font-size:14px;font-weight:700;letter-spacing:.2px;color:#18181b">${escapeHtml(brand ?? BRAND)}</td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:22px;line-height:28px;font-weight:700;padding-bottom:12px">${escapeHtml(heading)}</td></tr>
          <tr><td style="font-size:15px;line-height:24px;color:#3f3f46;padding-bottom:16px">${body}</td></tr>
          ${cta}
          ${small}
        </table>
      </td></tr>
      <tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:#a1a1aa">
        ${footer ?? "Sent by HCM, Madarth's internal HR system. This is an automated message — replies aren't monitored."}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
