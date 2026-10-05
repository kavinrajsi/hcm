"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PII_SELECT, readPii } from "@/lib/employee-pii";
import { requireRole } from "@/lib/rbac";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { sendEmail } from "@/lib/email";
import { letterEmail } from "@/lib/emails";
import { fillTemplate, getLetterTemplate, unfilledPlaceholders } from "@/lib/letter-templates";
import { isBlankHtml, toEmailHtml } from "@/lib/email-html";

export type LetterFormState = FormState & {
  // Draft round-trip: generate returns a prefilled draft for editing.
  draft?: {
    employeeId: string;
    type: string;
    subject: string;
    bodyHtml: string;
  };
};

const generateSchema = z.object({
  employeeId: z.string().min(1, "Pick an employee"),
  type: z.enum(["OFFER", "INTERN", "COMPENSATION"]),
});

export async function generateLetter(
  _prev: LetterFormState,
  formData: FormData,
): Promise<LetterFormState> {
  await requireRole("HR_ADMIN");
  const parsed = generateSchema.safeParse({
    employeeId: formData.get("employeeId"),
    type: formData.get("type"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: {
      id: true,
      name: true,
      empId: true,
      designation: true,
      department: true,
      dateOfJoining: true,
    },
  });
  if (!employee) return fieldError("employeeId", "Employee not found");

  const template = await getLetterTemplate(parsed.data.type);
  return {
    draft: {
      employeeId: employee.id,
      type: parsed.data.type,
      subject: fillTemplate(template.subject, employee),
      bodyHtml: fillTemplate(template.body, employee),
    },
  };
}

/** An identical letter within this window is treated as a double send. */
const RESEND_GUARD_MS = 2 * 60_000;

const sendSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["OFFER", "INTERN", "COMPENSATION"]),
  subject: z.string().trim().min(1, "Subject is required"),
  bodyHtml: z.string().trim().min(1, "Body is required"),
});

export async function sendLetter(
  _prev: LetterFormState,
  formData: FormData,
): Promise<LetterFormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = sendSchema.safeParse({
    employeeId: formData.get("employeeId"),
    type: formData.get("type"),
    subject: formData.get("subject"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return invalid(parsed.error);
  // Never trust the browser's HTML: keep only what email clients support.
  const bodyHtml = toEmailHtml(parsed.data.bodyHtml);
  if (isBlankHtml(bodyHtml)) return fieldError("bodyHtml", "Body is required");

  // Don't send a letter with blanks still in it.
  const subjectBlanks = unfilledPlaceholders(parsed.data.subject);
  if (subjectBlanks.length)
    return fieldError("subject", `Fill in ${subjectBlanks.join(", ")} before sending`);
  const bodyBlanks = unfilledPlaceholders(bodyHtml);
  if (bodyBlanks.length)
    return fieldError("bodyHtml", `Fill in ${bodyBlanks.join(", ")} before sending`);

  // A double click or re-submit sends the same letter again; refuse an
  // identical one created in the last couple of minutes.
  const duplicate = await db.letter.findFirst({
    where: {
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      subject: parsed.data.subject,
      bodyHtml,
      createdAt: { gt: new Date(Date.now() - RESEND_GUARD_MS) },
    },
    select: { id: true },
  });
  if (duplicate) return { error: "This letter was just sent. Check the list below before sending it again." };

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: { workEmail: true, ...PII_SELECT },
  });
  if (!employee) return { error: "Employee not found" };

  // Offer/intern letters go to personal mail (work mail may not exist yet);
  // fall back to work mail when no personal address is on file.
  const to =
    parsed.data.type === "COMPENSATION"
      ? employee.workEmail
      : (readPii(employee).personalEmail ?? employee.workEmail);

  // Save the letter even if sending fails, so HR doesn't lose it.
  let sent = false;
  let sendError: string | undefined;
  try {
    const result = await sendEmail({
      kind: "letter",
      employeeId: parsed.data.employeeId,
      sentById: user.id,
      to,
      ...letterEmail({
        subject: parsed.data.subject,
        bodyHtml,
      }),
    });
    sent = !result.skipped;
    if (result.skipped) {
      sendError =
        "Letter saved, but not emailed — email isn't set up (ZEPTOMAIL_TOKEN).";
    }
  } catch (error) {
    console.error("[letters] email failed", error);
    sendError =
      "Letter saved, but the email couldn't be sent. Try again later.";
  }

  await db.letter.create({
    data: {
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      subject: parsed.data.subject,
      bodyHtml,
      sentAt: sent ? new Date() : null,
      sentTo: sent ? to : null,
    },
  });

  revalidatePath("/letters");
  return {
    ok: true,
    error: sendError,
  };
}

const templateSchema = z.object({
  type: z.enum(["OFFER", "INTERN", "COMPENSATION"]),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(100_000),
});

export type TemplateFormState = FormState;

/** Saves HR's version of a starting template (placeholders kept). */
export async function saveLetterTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = templateSchema.safeParse({
    type: formData.get("type"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const body = toEmailHtml(parsed.data.body);
  if (isBlankHtml(body)) return fieldError("body", "Body is required");

  await db.letterTemplate.upsert({
    where: { type: parsed.data.type },
    create: {
      type: parsed.data.type,
      subject: parsed.data.subject,
      body,
      updatedById: user.id,
    },
    update: { subject: parsed.data.subject, body, updatedById: user.id },
  });
  revalidatePath("/letters");
  return { ok: true };
}

/** Drops HR's version so the built-in default is used again. */
export async function resetLetterTemplate(formData: FormData): Promise<void> {
  await requireRole("HR_ADMIN");
  const type = z
    .enum(["OFFER", "INTERN", "COMPENSATION"])
    .parse(formData.get("type"));
  await db.letterTemplate.deleteMany({ where: { type } });
  revalidatePath("/letters");
}
