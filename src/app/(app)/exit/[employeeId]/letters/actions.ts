"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { uploadDocument } from "@/lib/blob";
import { requireRole } from "@/lib/rbac";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { formatInstantDay } from "@/lib/format-date";
import {
  EXIT_LETTER_TEMPLATES,
  EXIT_LETTER_TYPES,
  exitLetterTypesFor,
  fillExitLetterTemplate,
  letterParagraphs,
} from "@/lib/exit-letters";
import { buildExitLetterPdf } from "@/lib/exit-letter-pdf";
import {
  EXIT_LETTER_SIGNATORY_KEY,
  getExitLetterSignatory,
} from "@/lib/exit-letter-signatory";

const generateSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(EXIT_LETTER_TYPES, { message: "Pick a letter type" }),
});

/** Makes one exit letter as a PDF, stores it privately and logs it on the employee. */
export async function generateExitLetter(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
      empId: true,
      name: true,
      designation: true,
      department: true,
      dateOfJoining: true,
      dateOfExit: true,
      empType: true,
    },
  });
  if (!employee) return { error: "Employee not found" };
  if (!employee.dateOfExit) return { error: "Record the exit before making its letters" };

  const { type } = parsed.data;
  if (!exitLetterTypesFor(employee.empType).includes(type)) {
    return fieldError("type", "This letter does not apply to this employee type");
  }

  const signatory = await getExitLetterSignatory();
  if (!signatory) {
    return { error: "Save who signs the letters first, below" };
  }

  const template = EXIT_LETTER_TEMPLATES[type];
  const filled = fillExitLetterTemplate(template.body, {
    ...employee,
    dateOfExit: employee.dateOfExit,
  });
  const pdf = await buildExitLetterPdf({
    title: template.title,
    issuedOn: formatInstantDay(new Date()),
    paragraphs: letterParagraphs(filled),
    signatory,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pdfBlobKey = await uploadDocument(
    `exit-letters/${employee.empId}/${type.toLowerCase()}-${stamp}.pdf`,
    Buffer.from(pdf),
  );
  await db.letter.create({
    data: {
      employeeId: employee.id,
      type,
      subject: fillExitLetterTemplate(template.subject, {
        ...employee,
        dateOfExit: employee.dateOfExit,
      }),
      bodyHtml: filled,
      pdfBlobKey,
    },
  });

  revalidatePath(`/exit/${employee.id}/letters`);
  return { ok: `${template.title} created.` };
}

const signatorySchema = z.object({
  name: z.string().trim().min(1, "Enter the signatory's name").max(100),
  designation: z.string().trim().min(1, "Enter their designation").max(100),
});

/** Who signs every exit letter. Stored once; changing it affects new letters only. */
export async function saveExitLetterSignatory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = signatorySchema.safeParse({
    name: formData.get("name") ?? "",
    designation: formData.get("designation") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const value = { name: parsed.data.name, designation: parsed.data.designation };
  await db.appSetting.upsert({
    where: { key: EXIT_LETTER_SIGNATORY_KEY },
    create: { key: EXIT_LETTER_SIGNATORY_KEY, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });

  revalidatePath("/exit", "layout");
  return { ok: "Signatory saved. New letters will use it." };
}
