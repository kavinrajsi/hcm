import { formatDay } from "@/lib/format-date";

// Exit documents HR hands a leaver: relieving and experience letters, or an
// internship certificate for interns. Kept apart from LETTER_TEMPLATES, which
// are emailed; these become PDFs. Letters state facts only, no performance
// remarks, so HR never signs off a claim the system cannot back up.

export const EXIT_LETTER_TYPES = [
  "RELIEVING",
  "EXPERIENCE",
  "INTERNSHIP_CERTIFICATE",
] as const;

export type ExitLetterType = (typeof EXIT_LETTER_TYPES)[number];

export const EXIT_LETTER_TEMPLATES: Record<
  ExitLetterType,
  { title: string; subject: string; body: string }
> = {
  RELIEVING: {
    title: "Relieving letter",
    subject: "Relieving Letter — {{name}}",
    body: `<p>To whom it may concern,</p>
<p>This is to confirm that <strong>{{name}}</strong> (Employee ID {{empId}}) was employed with Madarth as <strong>{{designation}}</strong> in our {{department}} team, from {{dateOfJoining}} to {{dateOfExit}}.</p>
<p>{{name}} has been relieved of all duties and responsibilities with effect from {{dateOfExit}}, and has no outstanding obligations towards the company.</p>
<p>We wish them well in future endeavours.</p>`,
  },
  EXPERIENCE: {
    title: "Experience letter",
    subject: "Experience Letter — {{name}}",
    body: `<p>To whom it may concern,</p>
<p>This is to certify that <strong>{{name}}</strong> (Employee ID {{empId}}) worked with Madarth as <strong>{{designation}}</strong> in our {{department}} team, from {{dateOfJoining}} to {{dateOfExit}}.</p>
<p>During this period, {{name}} carried out the responsibilities of the role. We wish them every success in their future career.</p>`,
  },
  INTERNSHIP_CERTIFICATE: {
    title: "Internship certificate",
    subject: "Internship Certificate — {{name}}",
    body: `<p>To whom it may concern,</p>
<p>This is to certify that <strong>{{name}}</strong> (Employee ID {{empId}}) completed an internship with Madarth as <strong>{{designation}}</strong> in our {{department}} team, from {{dateOfJoining}} to {{dateOfExit}}.</p>
<p>We thank them for their contribution and wish them every success.</p>`,
  },
};

/** Interns get a certificate; everyone else gets relieving + experience. */
export function exitLetterTypesFor(empType: string): ExitLetterType[] {
  return empType === "INTERN"
    ? ["INTERNSHIP_CERTIFICATE"]
    : ["RELIEVING", "EXPERIENCE"];
}

export function fillExitLetterTemplate(
  template: string,
  employee: {
    name: string;
    empId: string;
    designation: string;
    department: string;
    dateOfJoining: Date;
    dateOfExit: Date;
  },
): string {
  return template
    .replaceAll("{{name}}", employee.name)
    .replaceAll("{{empId}}", employee.empId)
    .replaceAll("{{designation}}", employee.designation)
    .replaceAll("{{department}}", employee.department)
    .replaceAll("{{dateOfJoining}}", formatDay(employee.dateOfJoining))
    .replaceAll("{{dateOfExit}}", formatDay(employee.dateOfExit));
}

/**
 * Plain paragraphs from a template body, for the PDF. Templates use only
 * <p>, <strong> and no entities, so splitting on </p> is enough.
 */
export function letterParagraphs(html: string): string[] {
  return html
    .split(/<\/p>/i)
    .map((chunk) => chunk.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}
