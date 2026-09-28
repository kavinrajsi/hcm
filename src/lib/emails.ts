import { appUrl, escapeHtml, renderEmail } from "@/lib/email-template";

// Subject + HTML for every email HCM sends. Keep wording here so it can be
// reviewed in one place; senders only pass data in.

export type Email = { subject: string; html: string };

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** New login (new joiner, Create login, Users & roles). */
export function inviteEmail({
  name,
  email,
  link,
}: {
  name?: string | null;
  email: string;
  link: string;
}): Email {
  const hello = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  return {
    subject: "Your HCM account is ready — set your password",
    html: renderEmail({
      preheader: "Set your password to sign in to HCM.",
      heading: "Welcome to HCM",
      body: `${hello}<br><br>An HCM account has been created for you. Use it to see your profile, leave and documents.<br><br>Your sign-in email is <strong>${escapeHtml(email)}</strong>. Choose a password to get started.`,
      button: { label: "Set your password", url: link },
      footnote:
        "This link works once and expires in 7 days. If it expires, ask HR for a new one.",
    }),
  };
}

/** Forgot password, or HR's "New password link" for an active account. */
export function resetEmail({ link }: { link: string }): Email {
  return {
    subject: "Reset your HCM password",
    html: renderEmail({
      preheader: "Use this link to choose a new HCM password.",
      heading: "Reset your password",
      body: "We received a request to reset the password for your HCM account.",
      button: { label: "Choose a new password", url: link },
      footnote:
        "This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    }),
  };
}

/** Sent to the leaver when HR records their exit. */
export function exitClearanceEmail({
  name,
  empId,
  dateOfExit,
}: {
  name: string;
  empId: string;
  dateOfExit: string;
}): Email {
  return {
    subject: `Exit clearance — ${name} (${empId})`,
    html: renderEmail({
      preheader: `Your last working day is recorded as ${fmtDate(dateOfExit)}.`,
      heading: "Your exit has been recorded",
      body: `Hi ${escapeHtml(name.split(" ")[0])},<br><br>HR has recorded your exit (${escapeHtml(empId)}) with a last working day of <strong>${escapeHtml(fmtDate(dateOfExit))}</strong>.<br><br>Before you leave, please:
<ul style="margin:8px 0 0;padding-left:20px">
<li>Return your ID card</li>
<li>Hand over company assets (laptop, accessories, access cards)</li>
<li>Complete knowledge transfer with your manager</li>
</ul>`,
      footnote:
        "Questions about your exit or final settlement? Reach out to HR. Thank you for your time at Madarth.",
    }),
  };
}

/** Daily cron → active HR admins. */
export function probationReminderEmail({
  rows,
}: {
  rows: { name: string; empId: string; dueDate: string; status: string }[];
}): Email {
  const list = rows
    .map(
      (row) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #f4f4f5">${escapeHtml(row.name)} <span style="color:#a1a1aa">${escapeHtml(row.empId)}</span></td>
  <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;text-align:right;white-space:nowrap">${escapeHtml(fmtDate(row.dueDate))}${row.status === "EXTENDED" ? ' <span style="color:#b45309">(extended)</span>' : ""}</td>
</tr>`,
    )
    .join("");
  const count = rows.length;
  return {
    subject: `${count} probation confirmation${count === 1 ? "" : "s"} due soon`,
    html: renderEmail({
      preheader: `${count} employee${count === 1 ? "" : "s"} due for confirmation within 14 days.`,
      heading: "Probation confirmations due",
      body: `These employees are due for confirmation within the next 14 days (or are overdue):
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px">${list}</table>`,
      button: { label: "Open Probation", url: appUrl("/probation") },
    }),
  };
}

/** A letter from Letters: HR-authored body inside the standard frame. */
export function letterEmail({
  subject,
  bodyHtml,
}: {
  subject: string;
  bodyHtml: string;
}): Email {
  return {
    subject,
    html: renderEmail({
      preheader: subject,
      heading: subject,
      body: bodyHtml,
    }),
  };
}
