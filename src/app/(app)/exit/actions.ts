"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form-state";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { exitClearanceEmail } from "@/lib/emails";
import { ID_CARD_STATUS_VALUES } from "@/lib/id-card-status";
import { DEVICE_TYPE_LABELS } from "@/lib/devices/devices";

const exitSchema = z.object({
  employeeId: z.string().min(1, "Pick the employee who's leaving"),
  dateOfExit: z.string().min(1, "Exit date is required"),
});

export type ExitFormState = FormState;

export async function markExit(
  _prev: ExitFormState,
  formData: FormData,
): Promise<ExitFormState> {
  const user = await requireRole("HR_ADMIN");

  const parsed = exitSchema.safeParse({
    employeeId: formData.get("employeeId") ?? "",
    dateOfExit: formData.get("dateOfExit") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    include: { idCard: true, probation: true },
  });
  if (!employee) return { error: "Employee not found" };
  if (employee.dateOfExit)
    return { error: "Employee already marked as exited" };

  // Exiting disables the linked login — never the last active HR admin's.
  if (employee.userId) {
    const login = await db.user.findUnique({
      where: { id: employee.userId },
      select: { role: true },
    });
    const otherAdmins = await db.user.count({
      where: {
        role: "HR_ADMIN",
        disabledAt: null,
        NOT: { id: employee.userId },
      },
    });
    if (login?.role === "HR_ADMIN" && otherAdmins === 0) {
      return {
        error:
          "This employee is the only HR admin. Make someone else HR admin (Users & roles) first.",
      };
    }
  }

  // Devices aren't returned automatically — someone has to collect them.
  // List them in the clearance email and for HR, and the Devices pages flag
  // them as held by a leaver until they're marked returned.
  const held = await db.device.findMany({
    where: { holderId: employee.id },
    orderBy: { assetTag: "asc" },
    select: { type: true, brand: true, model: true, assetTag: true },
  });
  const devices = held.map(
    (device) => `${DEVICE_TYPE_LABELS[device.type]} — ${device.brand} ${device.model} (${device.assetTag})`,
  );

  await db.$transaction([
    db.employee.update({
      where: { id: employee.id },
      data: { dateOfExit: new Date(parsed.data.dateOfExit) },
    }),
    // Auto-flag the ID card for return on exit.
    ...(employee.idCard && employee.idCard.status !== "RETURNED"
      ? [
          db.idCard.update({
            where: { id: employee.idCard.id },
            data: {
              status: "RETURN_PENDING",
              statusChanges: {
                create: {
                  fromStatus: employee.idCard.status,
                  toStatus: "RETURN_PENDING",
                  changedById: user.id,
                },
              },
            },
          }),
        ]
      : []),
    // The leaver can no longer sign in (undo exit re-enables the login).
    ...(employee.userId
      ? [
          db.user.update({
            where: { id: employee.userId },
            data: { disabledAt: new Date() },
          }),
        ]
      : []),
    // An unconfirmed probation closes with the exit (undo exit reopens it).
    ...(employee.probation &&
    (employee.probation.status === "PENDING" ||
      employee.probation.status === "EXTENDED")
      ? [
          db.probationRecord.update({
            where: { id: employee.probation.id },
            data: { status: "EXITED" },
          }),
        ]
      : []),
  ]);

  // The exit is saved; a failed email must not turn that into an error.
  try {
    await sendEmail({
      kind: "exit-clearance",
      employeeId: employee.id,
      sentById: user.id,
      to: employee.workEmail,
      ...exitClearanceEmail({
        name: employee.name,
        empId: employee.empId,
        dateOfExit: parsed.data.dateOfExit,
        devices,
      }),
    });
  } catch (error) {
    console.error("[exit] clearance email failed", error);
  }

  revalidatePath("/exit");
  revalidatePath("/id-cards");
  revalidatePath("/probation");
  revalidatePath("/employees");
  revalidatePath("/users");
  revalidatePath("/devices");
  return {
    ok: devices.length
      ? `Exit recorded. Collect ${devices.length} device${devices.length === 1 ? "" : "s"}: ${held
          .map((device) => device.assetTag)
          .join(", ")} — then mark ${devices.length === 1 ? "it" : "them"} returned on Devices.`
      : true,
  };
}

/** Reverses markExit: clears the exit date and reopens what it closed. */
export async function undoExit(formData: FormData) {
  const user = await requireRole("HR_ADMIN");
  const employeeId = formData.get("employeeId");
  if (typeof employeeId !== "string") throw new Error("Missing employeeId");

  await db.$transaction(async (transaction) => {
    const employee = await transaction.employee.update({
      where: { id: employeeId },
      data: { dateOfExit: null },
      include: { idCard: true, probation: true },
    });

    if (employee.userId) {
      await transaction.user.update({
        where: { id: employee.userId },
        data: { disabledAt: null },
      });
    }

    // Probation closed by the exit goes back to where it was.
    if (employee.probation?.status === "EXITED") {
      await transaction.probationRecord.update({
        where: { id: employee.probation.id },
        data: {
          status: employee.probation.extendedTo ? "EXTENDED" : "PENDING",
        },
      });
    }

    // ID card still waiting to be returned: restore its pre-exit status from
    // the history log (ISSUED if the exit predates the log). A card already
    // returned stays returned.
    const card = employee.idCard;
    if (card?.status === "RETURN_PENDING") {
      const flagged = await transaction.idCardStatusChange.findFirst({
        where: { idCardId: card.id, toStatus: "RETURN_PENDING" },
        orderBy: { changedAt: "desc" },
        select: { fromStatus: true },
      });
      const restored =
        ID_CARD_STATUS_VALUES.find(
          (status) =>
            status === flagged?.fromStatus && status !== "RETURN_PENDING",
        ) ?? "ISSUED";
      await transaction.idCard.update({
        where: { id: card.id },
        data: {
          status: restored,
          statusChanges: {
            create: {
              fromStatus: "RETURN_PENDING",
              toStatus: restored,
              changedById: user.id,
            },
          },
        },
      });
    }
  });

  revalidatePath("/exit");
  revalidatePath("/id-cards");
  revalidatePath("/probation");
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
}
