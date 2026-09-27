"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PII_SELECT, readPii } from "@/lib/employee-pii";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { letterEmail } from "@/lib/emails";
import { fillTemplate, LETTER_TEMPLATES } from "@/lib/letter-templates";

export type LetterFormState = {
  error?: string;
  ok?: boolean;
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
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

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
  if (!employee) return { error: "Employee not found" };

  const template = LETTER_TEMPLATES[parsed.data.type];
  return {
    draft: {
      employeeId: employee.id,
      type: parsed.data.type,
      subject: fillTemplate(template.subject, employee),
      bodyHtml: fillTemplate(template.body, employee),
    },
  };
}

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
  await requireRole("HR_ADMIN");
  const parsed = sendSchema.safeParse({
    employeeId: formData.get("employeeId"),
    type: formData.get("type"),
    subject: formData.get("subject"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid letter" };
  }

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
      to,
      ...letterEmail({
        subject: parsed.data.subject,
        bodyHtml: parsed.data.bodyHtml,
      }),
    });
    sent = !result.skipped;
    if (result.skipped) {
      sendError =
        "Letter saved, but not emailed — email isn't set up (ZEPTOMAIL_TOKEN).";
    }
  } catch (e) {
    console.error("[letters] email failed", e);
    sendError =
      "Letter saved, but the email couldn't be sent. Try again later.";
  }

  await db.letter.create({
    data: {
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
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
