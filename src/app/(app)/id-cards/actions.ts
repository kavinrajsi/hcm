"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

const statusSchema = z.enum([
  "PHOTO_TAKEN",
  "CORRECTION",
  "PENDING",
  "ISSUED",
  "RETURN_PENDING",
  "RETURNED",
]);

export async function updateIdCardStatus(formData: FormData) {
  await requireRole("HR_ADMIN");

  const id = formData.get("id");
  const status = statusSchema.parse(formData.get("status"));
  if (typeof id !== "string") throw new Error("Missing id");

  await db.idCard.update({
    where: { id },
    data: {
      status,
      issuedAt: status === "ISSUED" ? new Date() : undefined,
    },
  });

  revalidatePath("/id-cards");
}
