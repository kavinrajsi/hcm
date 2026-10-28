"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { requireRole } from "@/lib/rbac";
import {
  cell,
  collectRows,
  importSummary,
  parseCsvFile,
  type ImportState,
} from "@/lib/csv-import";
import { appendNote } from "@/app/(app)/candidates/notes";
import { cleanNoteHtml, plainNoteText } from "@/app/(app)/candidates/note-html";

export type FreelancerFormState = FormState;

// Every field is required. `notes` is the first entry of the freelancer's
// timeline (a JSON log, same shape as candidate notes), not a single text.
// "behance.net/meena" becomes "https://behance.net/meena" so the link works.
const profileUrl = z
  .string()
  .trim()
  .min(1, "Profile URL is required")
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => URL.canParse(value), "Profile URL must be a web address, e.g. behance.net/name");

const freelancerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  phone: z.string().trim().min(1, "Phone number is required"),
  skillset: z.string().trim().min(1, "Skillset is required"),
  profileUrl,
  rate: z.string().trim().min(1, "Rate is required"),
  availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE", "UNKNOWN"], {
    error: "Pick a status",
  }),
  notes: z
    .string()
    .transform(cleanNoteHtml)
    .refine((html) => plainNoteText(html) !== "", "Note is required")
    .refine((html) => plainNoteText(html).length <= 5000, "Note is too long (5,000 characters at most)"),
});

function parse(formData: FormData) {
  return freelancerSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    skillset: formData.get("skillset") ?? "",
    profileUrl: formData.get("profileUrl") ?? "",
    rate: formData.get("rate") ?? "",
    availability: formData.get("availability") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function addFreelancer(
  _prev: FreelancerFormState,
  formData: FormData,
): Promise<FreelancerFormState> {
  await requireRole("HR_ADMIN", "MANAGER");
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { notes, ...fields } = parsed.data;
  await db.freelancer.create({ data: { ...fields, notes: appendNote(null, notes) } });
  revalidatePath("/freelancers");
  return { ok: true };
}

/** Edits the details only; the timeline is changed through addFreelancerNote. */
export async function updateFreelancer(
  id: string,
  _prev: FreelancerFormState,
  formData: FormData,
): Promise<FreelancerFormState> {
  await requireRole("HR_ADMIN", "MANAGER");
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { name, email, phone, skillset, profileUrl, rate, availability } = parsed.data;
  await db.freelancer.update({
    where: { id },
    data: { name, email, phone, skillset, profileUrl, rate, availability },
  });
  revalidatePath("/freelancers");
  return { ok: true };
}

const timelineSchema = z.object({
  id: z.string().min(1).max(64),
  text: z
    .string()
    .transform(cleanNoteHtml)
    .refine((html) => plainNoteText(html) !== "", "Note is empty")
    .refine((html) => plainNoteText(html).length <= 5000, "Note is too long (5,000 characters at most)"),
});

/** Adds one entry to the freelancer's timeline. */
export async function addFreelancerNote(
  _prev: FreelancerFormState,
  formData: FormData,
): Promise<FreelancerFormState> {
  await requireRole("HR_ADMIN", "MANAGER");
  const parsed = timelineSchema.safeParse({
    id: formData.get("id") ?? "",
    text: formData.get("text") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const row = await db.freelancer.findUnique({
    where: { id: parsed.data.id },
    select: { notes: true },
  });
  if (!row) return fieldError("text", "Freelancer not found");

  await db.freelancer.update({
    where: { id: parsed.data.id },
    data: { notes: appendNote(row.notes, parsed.data.text) },
  });
  revalidatePath("/freelancers");
  return { ok: true };
}

export async function importFreelancers(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("HR_ADMIN", "MANAGER");

  const parsed = await parseCsvFile(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { valid, failures } = collectRows(parsed.rows, (row) => {
    const result = freelancerSchema.safeParse({
      name: row.name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      skillset: row.skillset ?? "",
      profileUrl: row.profileUrl ?? "",
      rate: row.rate ?? "",
      availability: cell(row, "availability") ?? "UNKNOWN",
      notes: row.notes ?? "",
    });
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid row");
    }
    const { notes, ...fields } = result.data;
    return { ...fields, notes: appendNote(null, notes) };
  });

  await db.freelancer.createMany({ data: valid });
  revalidatePath("/freelancers");
  return importSummary(valid.length, parsed.rows.length, failures);
}

export async function deleteFreelancer(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");
  await db.freelancer.delete({ where: { id } });
  revalidatePath("/freelancers");
}
