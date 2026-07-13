import { Resend } from "resend";

// Thin Resend wrapper. All outbound mail (letters, probation reminders,
// exit clearance) goes through sendEmail so from-address and error handling
// stay in one place. No-ops with a console warning when the key is unset
// (local dev without email).

const FROM = process.env.EMAIL_FROM ?? "HR <hr@example.com>";

export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY unset; skipped: ${options.subject}`);
    return { skipped: true as const };
  }
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });
  if (error) {
    throw new Error(`Email send failed: ${error.message}`);
  }
  return { skipped: false as const, id: data?.id };
}
