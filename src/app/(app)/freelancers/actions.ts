"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  cell,
  collectRows,
  importSummary,
  parseCsvFile,
  type ImportState,
} from "@/lib/csv-import";

export type FreelancerFormState = { error?: string; ok?: boolean };

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const freelancerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: optional,
  phone: optional,
  skillset: z.string().trim().min(1, "Skillset is required"),
  rate: optional,
  availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE", "UNKNOWN"]),
  notes: optional,
});

function parse(formData: FormData) {
  return freelancerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    skillset: formData.get("skillset"),
    rate: formData.get("rate") ?? undefined,
    availability: formData.get("availability") ?? "UNKNOWN",
    notes: formData.get("notes") ?? undefined,
  });
}

export async function addFreelancer(
  _prev: FreelancerFormState,
  formData: FormData,
): Promise<FreelancerFormState> {
  await requireRole("HR_ADMIN", "MANAGER");
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid record" };
  }
  await db.freelancer.create({ data: parsed.data });
  revalidatePath("/freelancers");
  return { ok: true };
}

export async function updateFreelancer(
  id: string,
  _prev: FreelancerFormState,
  formData: FormData,
): Promise<FreelancerFormState> {
  await requireRole("HR_ADMIN", "MANAGER");
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid record" };
  }
  await db.freelancer.update({ where: { id }, data: parsed.data });
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
      name: row.name,
      email: cell(row, "email"),
      phone: cell(row, "phone"),
      skillset: row.skillset,
      rate: cell(row, "rate"),
      availability: cell(row, "availability") ?? "UNKNOWN",
      notes: cell(row, "notes"),
    });
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid row");
    }
    return result.data;
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
