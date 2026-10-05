import { db } from "@/lib/db";
import { formatDay } from "@/lib/format-date";

// Editable starting templates for Letters. Placeholders are replaced with
// employee data at generation time; HR edits the result before sending.

export const LETTER_TEMPLATES = {
  OFFER: {
    subject: "Offer of Employment — {{name}}",
    body: `<p>Dear {{name}},</p>
<p>We are pleased to offer you the position of <strong>{{designation}}</strong> in our {{department}} team, joining on {{dateOfJoining}}.</p>
<p>Your employee ID will be {{empId}}. Detailed compensation terms are enclosed separately.</p>
<p>We look forward to having you on board.</p>
<p>Regards,<br/>HR Team</p>`,
  },
  INTERN: {
    subject: "Internship Offer — {{name}}",
    body: `<p>Dear {{name}},</p>
<p>We are pleased to offer you an internship as <strong>{{designation}}</strong> in our {{department}} team, starting {{dateOfJoining}}.</p>
<p>Your employee ID will be {{empId}}.</p>
<p>Regards,<br/>HR Team</p>`,
  },
  COMPENSATION: {
    subject: "Revised Compensation — {{name}}",
    body: `<p>Dear {{name}},</p>
<p>Following your review, we are pleased to share your revised compensation effective from the coming cycle.</p>
<p>Role: <strong>{{designation}}</strong>, {{department}}.</p>
<p>Revised terms are detailed below:</p>
<p>[Enter revised compensation details]</p>
<p>Regards,<br/>HR Team</p>`,
  },
} as const;

export type LetterTypeKey = keyof typeof LETTER_TEMPLATES;

export function fillTemplate(
  template: string,
  employee: {
    name: string;
    empId: string;
    designation: string;
    department: string;
    dateOfJoining: Date;
  },
): string {
  return template
    .replaceAll("{{name}}", employee.name)
    .replaceAll("{{empId}}", employee.empId)
    .replaceAll("{{designation}}", employee.designation)
    .replaceAll("{{department}}", employee.department)
    .replaceAll("{{dateOfJoining}}", formatDay(employee.dateOfJoining));
}

/** The template HR saved for this type, or the built-in default. */
export async function getLetterTemplate(type: LetterTypeKey): Promise<{
  subject: string;
  body: string;
  custom: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
}> {
  const saved = await db.letterTemplate.findUnique({
    where: { type },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  if (!saved) {
    const fallback = LETTER_TEMPLATES[type];
    return {
      subject: fallback.subject,
      body: fallback.body,
      custom: false,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    subject: saved.subject,
    body: saved.body,
    custom: true,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy?.name || saved.updatedBy?.email || null,
  };
}

/**
 * Blanks left in a letter that must be filled before sending: "[Enter …]"
 * style notes and any unreplaced {{placeholder}}. Returns them as written.
 */
export function unfilledPlaceholders(text: string): string[] {
  const plain = text.replace(/<[^>]+>/g, " ");
  const found = [
    ...plain.matchAll(/\[(?:enter|insert|add|fill in|type)\b[^\]]*\]/gi),
    ...plain.matchAll(/\{\{\s*[\w.]+\s*\}\}/g),
  ].map((match) => match[0]);
  return [...new Set(found)];
}
