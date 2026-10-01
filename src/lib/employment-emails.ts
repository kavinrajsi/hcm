import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { appUrl, escapeHtml, renderEmail } from "@/lib/email-template";
import { EMP_TYPE_LABELS } from "@/lib/emp-type";
import { formatDay } from "@/lib/format-date";
import { istDay } from "@/lib/date-filter";

// Employment-type emails: one when an employee's type changes (to them,
// copying HR and Finance), and a one-week heads-up to HR before a
// probation, contract or internship ends.

export const HR_EMAIL = process.env.HR_EMAIL || "hr@madarth.com";
export const FINANCE_EMAIL = process.env.FINANCE_EMAIL || "finance@madarth.com";

const label = (type: string) => EMP_TYPE_LABELS[type] ?? type;

const END_LABEL: Record<string, string> = {
  PROBATION: "Probation confirmation due",
  CONTRACT: "Contract ends",
  INTERN: "Internship ends",
};

export function typeChangeEmail(input: {
  name: string;
  empId: string;
  from: string;
  to: string;
  effective: Date;
  endsOn: Date | null;
}): { subject: string; html: string } {
  const first = input.name.trim().split(/\s+/)[0] ?? input.name;
  const end =
    input.endsOn && END_LABEL[input.to]
      ? `<br>${escapeHtml(END_LABEL[input.to])}: <strong>${escapeHtml(formatDay(input.endsOn))}</strong>.`
      : "";
  return {
    subject: `Your employment type is now ${label(input.to)}`,
    html: renderEmail({
      preheader: `${label(input.from)} → ${label(input.to)}, effective ${formatDay(input.effective)}.`,
      heading: `You're now ${label(input.to)}`,
      body: `Hi ${escapeHtml(first)},<br><br>Your employment type (${escapeHtml(input.empId)}) has changed from
<strong>${escapeHtml(label(input.from))}</strong> to <strong>${escapeHtml(label(input.to))}</strong>,
effective <strong>${escapeHtml(formatDay(input.effective))}</strong>.${end}<br><br>
If you have questions, reply to this email to reach HR.`,
      footer: `Sent by HCM, Madarth's internal HR system. Replies go to <a href="mailto:${escapeHtml(HR_EMAIL)}" style="color:#a1a1aa">${escapeHtml(HR_EMAIL)}</a>.`,
    }),
  };
}

/**
 * Emails the employee (CC HR and Finance) that their type changed.
 * Best-effort: never throws, so it can't undo or block the save.
 */
export async function notifyTypeChange(employeeId: string, from: string, to: string): Promise<boolean> {
  if (from === to) return false;
  try {
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: {
        name: true,
        empId: true,
        workEmail: true,
        empTypeEndsOn: true,
        probation: { select: { dueDate: true, status: true } },
      },
    });
    if (!employee) return false;
    const endsOn =
      to === "PROBATION"
        ? (employee.probation?.dueDate ?? null)
        : to === "CONTRACT" || to === "INTERN"
          ? employee.empTypeEndsOn
          : null;
    const result = await sendEmail({
      kind: "type-change",
      employeeId,
      to: employee.workEmail,
      cc: [HR_EMAIL, FINANCE_EMAIL].filter((address) => address.toLowerCase() !== employee.workEmail.toLowerCase()),
      replyTo: HR_EMAIL,
      ...typeChangeEmail({
        name: employee.name,
        empId: employee.empId,
        from,
        to,
        effective: new Date(`${istDay()}T00:00:00Z`),
        endsOn,
      }),
    });
    return !result.skipped;
  } catch (error) {
    console.error("[employment-emails] type change email failed", employeeId, error);
    return false;
  }
}

// --- One week before the end ---

export type EndingRow = {
  employeeId: string;
  name: string;
  empId: string;
  kind: "probation" | "contract" | "internship";
  endsOn: Date;
  daysLeft: number;
};

const KIND_LABEL: Record<EndingRow["kind"], string> = {
  probation: "Probation confirmation due",
  contract: "Contract ends",
  internship: "Internship ends",
};

const DAY_MS = 86_400_000;
export const REMIND_DAYS = 7;

/** Active employees whose probation, contract or internship ends within 7 days. */
export async function findEndingSoon(today = istDay()): Promise<EndingRow[]> {
  const start = new Date(`${today}T00:00:00Z`);
  const until = new Date(start.getTime() + REMIND_DAYS * DAY_MS);
  const active = { OR: [{ dateOfExit: null }, { dateOfExit: { gt: start } }] };
  const [probations, timeBound, sent] = await Promise.all([
    db.probationRecord.findMany({
      where: {
        status: { notIn: ["CONFIRMED", "EXITED"] },
        dueDate: { gte: start, lte: until },
        employee: active,
      },
      select: { dueDate: true, employee: { select: { id: true, name: true, empId: true } } },
    }),
    db.employee.findMany({
      where: { ...active, empType: { in: ["CONTRACT", "INTERN"] }, empTypeEndsOn: { gte: start, lte: until } },
      select: { id: true, name: true, empId: true, empType: true, empTypeEndsOn: true },
    }),
    db.employmentReminder.findMany({
      where: { endsOn: { gte: start, lte: until } },
      select: { employeeId: true, kind: true, endsOn: true },
    }),
  ]);
  const already = new Set(sent.map((row) => `${row.employeeId}|${row.kind}|${row.endsOn.toISOString().slice(0, 10)}`));
  const rows: EndingRow[] = [
    ...probations.map((record) => ({
      employeeId: record.employee.id,
      name: record.employee.name,
      empId: record.employee.empId,
      kind: "probation" as const,
      endsOn: record.dueDate,
    })),
    ...timeBound.map((employee) => ({
      employeeId: employee.id,
      name: employee.name,
      empId: employee.empId,
      kind: (employee.empType === "CONTRACT" ? "contract" : "internship") as EndingRow["kind"],
      endsOn: employee.empTypeEndsOn!,
    })),
  ]
    .filter((row) => !already.has(`${row.employeeId}|${row.kind}|${row.endsOn.toISOString().slice(0, 10)}`))
    .map((row) => ({ ...row, daysLeft: Math.round((row.endsOn.getTime() - start.getTime()) / DAY_MS) }));
  return rows.sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime());
}

export function endReminderEmail(rows: EndingRow[]): { subject: string; html: string } {
  const list = rows
    .map((row) => {
      const link = appUrl(row.kind === "probation" ? "/probation" : `/employees/${row.employeeId}`);
      const when = row.daysLeft === 0 ? "today" : row.daysLeft === 1 ? "tomorrow" : `in ${row.daysLeft} days`;
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #f4f4f5"><a href="${escapeHtml(link)}" style="color:#18181b">${escapeHtml(row.name)}</a> <span style="color:#a1a1aa">${escapeHtml(row.empId)}</span><br><span style="color:#71717a;font-size:13px">${escapeHtml(KIND_LABEL[row.kind])}</span></td>
  <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;text-align:right;white-space:nowrap">${escapeHtml(formatDay(row.endsOn))}<br><span style="color:#b45309;font-size:13px">${when}</span></td>
</tr>`;
    })
    .join("");
  const count = rows.length;
  return {
    subject: `${count} employment${count === 1 ? "" : "s"} ending within a week`,
    html: renderEmail({
      preheader: `${count} probation, contract or internship end${count === 1 ? "" : "s"} in the next 7 days.`,
      heading: "Ending within a week",
      body: `These end in the next 7 days. Decide on confirmation, extension or exit:
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px">${list}</table>`,
      button: { label: "Open Probation", url: appUrl("/probation") },
    }),
  };
}

/**
 * Emails HR the ends due within a week that haven't been reminded yet, then
 * records them so they're never repeated. `dryRun` sends and records nothing.
 */
export async function sendEndReminders({ dryRun = false } = {}): Promise<{ rows: EndingRow[]; emailed: boolean }> {
  const rows = await findEndingSoon();
  if (rows.length === 0 || dryRun) return { rows, emailed: false };
  const result = await sendEmail({ kind: "ending-soon", to: HR_EMAIL, ...endReminderEmail(rows) });
  if (result.skipped) return { rows, emailed: false };
  await db.employmentReminder.createMany({
    data: rows.map((row) => ({ employeeId: row.employeeId, kind: row.kind, endsOn: row.endsOn })),
    skipDuplicates: true,
  });
  return { rows, emailed: true };
}
