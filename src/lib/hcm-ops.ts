import { z } from "zod";
import { db } from "@/lib/db";
import { notifyTypeChange } from "@/lib/employment-emails";
import { encryptPii } from "@/lib/employee-pii";
import type { CandidateStatus } from "@/app/(app)/candidates/statuses";
import { appendNote } from "@/app/(app)/candidates/notes";
import { statusOf } from "@/app/(app)/candidates/query";

// Data changes shared by the Server Actions and MadMax's tools. No auth
// here: every caller checks the signed-in user's scope first.

const optional = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/** Self-service scope: contact + address only. Everything else is HR-only. */
export const contactSchema = z.object({
  phone: z.string().trim().min(7, "Phone is required"),
  personalEmail: z.string().trim().pipe(z.email("Invalid personal email")),
  emergencyContact: optional,
  fatherName: z
    .string()
    .trim()
    .max(100, "Keep it under 100 characters")
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  address: optional,
  city: optional,
  state: optional,
  pincode: optional,
});
export type ContactInput = z.infer<typeof contactSchema>;

export async function saveContact(employeeId: string, input: ContactInput) {
  const { city, state, pincode, fatherName, ...pii } = input;
  await db.employee.update({
    where: { id: employeeId },
    data: { city, state, pincode, fatherName, ...encryptPii(pii) },
  });
}

export async function createQuantumEntry(entry: {
  employeeId: string;
  date: Date;
  brand: string;
  workName: string;
  link?: string;
  durationMins: number;
}) {
  return db.quantumEntry.create({ data: entry, select: { id: true } });
}

/**
 * Sets a candidate's status and logs the move (skipped when unchanged).
 * Reads the old value inside the transaction so concurrent moves each log
 * the status they actually replaced.
 */
export async function moveCandidate(
  id: bigint,
  toStatus: CandidateStatus,
  userId: string,
): Promise<void> {
  await db.$transaction(async (transaction) => {
    const { status } = await transaction.candidate.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    const fromStatus = statusOf(status);
    if (fromStatus === toStatus) return;
    await transaction.candidate.update({
      where: { id },
      data: { status: toStatus },
    });
    await transaction.candidateStatusChange.create({
      data: { candidateId: id, fromStatus, toStatus, changedById: userId },
    });
  });
}

/** Appends to the candidate's JSON note log (shared with the website). */
export async function addNoteToCandidate(id: bigint, text: string) {
  await db.$transaction(async (transaction) => {
    const row = await transaction.candidate.findUniqueOrThrow({
      where: { id },
      select: { notes: true },
    });
    await transaction.candidate.update({
      where: { id },
      data: { notes: appendNote(row.notes, text) },
    });
  });
}

/** Approve / reject a leave post (PENDING = undo a decision). */
export async function setLeaveDecision(
  entryId: string,
  decision: "APPROVED" | "REJECTED" | "PENDING",
  reviewerId: string,
) {
  const undo = decision === "PENDING";
  await db.leaveEntry.update({
    where: { id: entryId },
    data: {
      status: decision,
      reviewedById: undo ? null : reviewerId,
      reviewedAt: undo ? null : new Date(),
    },
  });
}

/** A probation decision that no longer applies (already decided, or the person left). */
export class ProbationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbationStateError";
  }
}

// Only open probations of people still employed can be confirmed or
// extended. Checked in the update's own where, so a double click or a
// stale page can't confirm twice or reopen a confirmed / exited record.
const openProbation = (id: string) => ({
  id,
  status: { in: ["PENDING" as const, "EXTENDED" as const] },
  employee: { dateOfExit: null },
});

/** Confirmation promotes the employee to permanent (and emails them). */
export async function confirmProbationRecord(id: string) {
  const change = await db.$transaction(async (transaction) => {
    const { count } = await transaction.probationRecord.updateMany({
      where: openProbation(id),
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (count === 0)
      throw new ProbationStateError("This probation is already confirmed, or the employee has left.");
    const record = await transaction.probationRecord.findUniqueOrThrow({
      where: { id },
      select: { employeeId: true },
    });
    const before = await transaction.employee.findUnique({
      where: { id: record.employeeId },
      select: { empType: true },
    });
    await transaction.employee.update({
      where: { id: record.employeeId },
      data: { empType: "PERMANENT" },
    });
    return { employeeId: record.employeeId, from: before?.empType ?? "PROBATION" };
  });
  if (change.from !== "PERMANENT")
    await notifyTypeChange(change.employeeId, change.from, "PERMANENT");
}

/**
 * The new due date is the extension date, so it re-enters the due list.
 * It must be later than the current due date.
 */
export async function extendProbationRecord(
  id: string,
  extendedTo: Date,
  notes?: string,
) {
  const record = await db.probationRecord.findUnique({
    where: { id },
    select: { dueDate: true },
  });
  if (!record) throw new ProbationStateError("Probation record not found.");
  if (extendedTo.getTime() <= record.dueDate.getTime())
    throw new ProbationStateError("Extend to a date after the current due date.");

  const { count } = await db.probationRecord.updateMany({
    where: openProbation(id),
    data: {
      status: "EXTENDED",
      extendedTo,
      dueDate: extendedTo,
      notes: notes || undefined,
    },
  });
  if (count === 0)
    throw new ProbationStateError("This probation is already confirmed, or the employee has left.");
}
