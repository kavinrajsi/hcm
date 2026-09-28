import type { Prisma } from "@/generated/prisma/client";

// End date for the time-bound employment types: internship end, probation
// confirmation due, contract end. Probation keeps its date on the probation
// record (/probation, reminders and exit read it there); intern and
// contract use Employee.empTypeEndsOn. Shared by the form and the actions.

export const TYPE_END_DEFAULT_DAYS = 90;

export type EmpTypeValue = "INTERN" | "PROBATION" | "PERMANENT" | "CONTRACT";

export const TYPE_END_LABELS: Partial<Record<EmpTypeValue, string>> = {
  INTERN: "Internship end date",
  PROBATION: "Confirmation due",
  CONTRACT: "Contract end date",
};

export function hasTypeEnd(empType: string): boolean {
  return empType in TYPE_END_LABELS;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" plus `days`, or "" when `day` isn't a valid date. */
export function addDaysToDay(day: string, days: number): string {
  if (!DAY.test(day)) return "";
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) return "";
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}

/** Default end date: TYPE_END_DEFAULT_DAYS after `from` (a UTC midnight). */
export function typeEndDefault(from: Date): Date {
  return new Date(from.getTime() + TYPE_END_DEFAULT_DAYS * 86_400_000);
}

/** The submitted end date, or the default counted from `fallbackFrom`. */
export function resolveTypeEnd(
  value: string | undefined,
  fallbackFrom: Date,
): Date {
  const time =
    value && DAY.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isNaN(time) ? typeEndDefault(fallbackFrom) : new Date(time);
}

/**
 * Employee update fields for the type's end date. Switching into Probation
 * reopens a confirmed or exited probation record; moving the date on an
 * ongoing probation only changes the due date (status and extensions stay).
 */
export function typeEndUpdateData({
  empType,
  previousType,
  endDate,
  probation,
}: {
  empType: EmpTypeValue;
  previousType: EmpTypeValue;
  endDate: Date;
  probation: { status: string } | null;
}): Pick<Prisma.EmployeeUpdateInput, "empTypeEndsOn" | "probation"> {
  if (empType === "INTERN" || empType === "CONTRACT") {
    return { empTypeEndsOn: endDate };
  }
  if (empType === "PERMANENT") return { empTypeEndsOn: null };

  if (!probation) {
    return { empTypeEndsOn: null, probation: { create: { dueDate: endDate } } };
  }
  const reopen =
    previousType !== "PROBATION" &&
    (probation.status === "CONFIRMED" || probation.status === "EXITED");
  return {
    empTypeEndsOn: null,
    probation: {
      update: reopen
        ? {
            dueDate: endDate,
            status: "PENDING",
            extendedTo: null,
            confirmedAt: null,
          }
        : { dueDate: endDate },
    },
  };
}
