"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

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

export async function deleteFreelancer(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");
  await db.freelancer.delete({ where: { id } });
  revalidatePath("/freelancers");
}
