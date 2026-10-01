import { db } from "@/lib/db";
import { appUrl } from "@/lib/email-template";
import {
  exitClearanceEmail,
  inviteEmail,
  letterEmail,
  probationReminderEmail,
  resetEmail,
  type Email,
} from "@/lib/emails";
import { endReminderEmail, FINANCE_EMAIL, HR_EMAIL, typeChangeEmail } from "@/lib/employment-emails";
import {
  PURCHASE_EMAIL_FROM,
  PURCHASE_EMAIL_SETTING,
  purchaseRequestEmail,
  readPurchaseEmailSettings,
} from "@/lib/devices/purchase";
import { fillTemplate, getLetterTemplate, type LetterTypeKey } from "@/lib/letter-templates";

// Every email HCM sends, for Admin → Email templates: when it goes out,
// who gets it, and a preview rendered by the real builder with sample data.

const DEFAULT_FROM = process.env.EMAIL_FROM || "HCM <noreply@madarth.com>";

export type CatalogEmail = {
  key: string;
  name: string;
  group: "Accounts" | "Employees" | "Reminders" | "Letters" | "Devices";
  trigger: string;
  from: string;
  to: string;
  cc?: string;
  replyTo?: string;
  /** Where HR can change the wording or recipients, if anywhere. */
  editAt?: { label: string; href: string };
  render: () => Promise<Email>;
};

const SAMPLE = {
  name: "Asha Rao",
  empId: "PBCH0100",
  email: "asha.rao@madarth.com",
  designation: "Designer",
  department: "Creative",
  dateOfJoining: new Date("2026-10-15T00:00:00Z"),
};
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

const LETTERS: [LetterTypeKey, string, string][] = [
  ["OFFER", "Offer letter", "Employee's personal email (work email if none)"],
  ["INTERN", "Intern letter", "Employee's personal email (work email if none)"],
  ["COMPENSATION", "Revised compensation letter", "Employee's work email"],
];

async function purchaseSettings() {
  const row = await db.appSetting.findUnique({ where: { key: PURCHASE_EMAIL_SETTING } });
  return readPurchaseEmailSettings(row?.value);
}

export async function emailCatalog(): Promise<CatalogEmail[]> {
  const purchase = await purchaseSettings();
  return [
    {
      key: "invite",
      name: "Account invite",
      group: "Accounts",
      trigger: "A login is created: new joiner, Create login, or Users & roles.",
      from: DEFAULT_FROM,
      to: "The new user",
      render: async () =>
        inviteEmail({ name: SAMPLE.name, email: SAMPLE.email, link: appUrl("/reset-password?token=sample") }),
    },
    {
      key: "reset",
      name: "Password reset",
      group: "Accounts",
      trigger: "Someone uses Forgot password, or HR sends a new password link.",
      from: DEFAULT_FROM,
      to: "The account's email",
      render: async () => resetEmail({ link: appUrl("/reset-password?token=sample") }),
    },
    {
      key: "type-change",
      name: "Employment type changed",
      group: "Employees",
      trigger: "HR changes an employee's type, or confirms their probation.",
      from: DEFAULT_FROM,
      to: "The employee's work email",
      cc: `${HR_EMAIL}, ${FINANCE_EMAIL}`,
      replyTo: HR_EMAIL,
      render: async () =>
        typeChangeEmail({
          name: SAMPLE.name,
          empId: SAMPLE.empId,
          from: "PROBATION",
          to: "CONTRACT",
          effective: new Date(),
          endsOn: inDays(180),
        }),
    },
    {
      key: "exit-clearance",
      name: "Exit clearance",
      group: "Employees",
      trigger: "HR records an employee's exit.",
      from: DEFAULT_FROM,
      to: "The leaver's work email",
      render: async () =>
        exitClearanceEmail({ name: SAMPLE.name, empId: SAMPLE.empId, dateOfExit: inDays(30).toISOString() }),
    },
    {
      key: "probation-digest",
      name: "Probation confirmations due",
      group: "Reminders",
      trigger: "Daily at 9:00 IST, when any confirmation is due within 14 days or overdue.",
      from: DEFAULT_FROM,
      to: "All active HR admins",
      render: async () =>
        probationReminderEmail({
          rows: [
            { name: SAMPLE.name, empId: SAMPLE.empId, dueDate: inDays(5).toISOString(), status: "PENDING" },
            { name: "Ravi Kumar", empId: "PBCH0101", dueDate: inDays(12).toISOString(), status: "EXTENDED" },
          ],
        }),
    },
    {
      key: "ending-soon",
      name: "Ending within a week",
      group: "Reminders",
      trigger: "Daily at 9:15 IST, once per end date, 7 days before a probation, contract or internship ends.",
      from: DEFAULT_FROM,
      to: HR_EMAIL,
      render: async () =>
        endReminderEmail([
          { employeeId: "sample-1", name: SAMPLE.name, empId: SAMPLE.empId, kind: "probation", endsOn: inDays(3), daysLeft: 3 },
          { employeeId: "sample-2", name: "Ravi Kumar", empId: "PBCH0101", kind: "contract", endsOn: inDays(7), daysLeft: 7 },
        ]),
    },
    ...LETTERS.map(
      ([type, name, to]): CatalogEmail => ({
        key: `letter-${type.toLowerCase()}`,
        name,
        group: "Letters",
        trigger: "HR sends a letter from Letters (HR edits the draft first).",
        from: DEFAULT_FROM,
        to,
        editAt: { label: "Letters → Templates", href: "/letters" },
        render: async () => {
          const template = await getLetterTemplate(type);
          const subject = fillTemplate(template.subject, SAMPLE);
          return letterEmail({ subject, bodyHtml: fillTemplate(template.body, SAMPLE) });
        },
      }),
    ),
    {
      key: "device-request",
      name: "Device request to vendor",
      group: "Devices",
      trigger: "HR confirms a purchase request to a vendor (shown for review before sending).",
      from: PURCHASE_EMAIL_FROM,
      to: "The vendor contact HR picks",
      cc: purchase.cc.join(", "),
      replyTo: purchase.replyTo,
      editAt: { label: "Devices → Settings", href: "/devices/settings" },
      render: async () =>
        purchaseRequestEmail({
          vendorName: "Win Technology",
          contactName: "Prakash",
          type: "LAPTOP",
          os: "MAC",
          itemName: "MacBook Air M3 13-inch",
          quantity: 1,
          neededBy: inDays(10),
          notes: "For a new Designer joining on the 15th.",
          replyTo: purchase.replyTo,
        }),
    },
  ];
}

export async function catalogEmail(key: string) {
  return (await emailCatalog()).find((email) => email.key === key) ?? null;
}
