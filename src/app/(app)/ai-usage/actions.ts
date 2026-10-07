"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { invalid, type FormState } from "@/lib/form-state";
import { MADMAX_CAP_SETTING } from "@/lib/madmax/cap";

// Empty = no cap; otherwise whole rupees.
const rupees = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value >= 0), {
    message: "Whole rupees, 0 or more — or leave empty for no cap",
  });

const schema = z.object({ perUserInr: rupees, totalInr: rupees });

/** HR: MadMax AI monthly caps, per person and company-wide. */
export async function setMadmaxCap(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const hr = await requireRole("HR_ADMIN");
  const parsed = schema.safeParse({
    perUserInr: formData.get("perUserInr") ?? "",
    totalInr: formData.get("totalInr") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  await db.appSetting.upsert({
    where: { key: MADMAX_CAP_SETTING },
    create: { key: MADMAX_CAP_SETTING, value: parsed.data, updatedById: hr.id },
    update: { value: parsed.data, updatedById: hr.id },
  });
  revalidatePath("/ai-usage");
  return { ok: "Saved." };
}
