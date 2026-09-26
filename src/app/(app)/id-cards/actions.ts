"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { ID_CARD_STATUS_VALUES } from "@/lib/id-card-status";

const statusSchema = z.enum(ID_CARD_STATUS_VALUES);

export async function updateIdCardStatus(formData: FormData) {
  const user = await requireRole("HR_ADMIN");

  const id = formData.get("id");
  const status = statusSchema.parse(formData.get("status"));
  if (typeof id !== "string") throw new Error("Missing id");

  // Read the old value inside the transaction so concurrent moves each log
  // the status they actually replaced; unchanged selections log nothing.
  const employeeId = await db.$transaction(async (tx) => {
    const card = await tx.idCard.findUniqueOrThrow({
      where: { id },
      select: { status: true, employeeId: true },
    });
    if (card.status === status) return card.employeeId;
    await tx.idCard.update({
      where: { id },
      data: {
        status,
        issuedAt: status === "ISSUED" ? new Date() : undefined,
      },
    });
    await tx.idCardStatusChange.create({
      data: {
        idCardId: id,
        fromStatus: card.status,
        toStatus: status,
        changedById: user.id,
      },
    });
    return card.employeeId;
  });

  revalidatePath("/id-cards");
  revalidatePath(`/employees/${employeeId}`);
}
