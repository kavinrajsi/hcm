"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { AuthorizationError, requireRole } from "@/lib/rbac";
import { LEAVE_TYPES } from "@/lib/leave";
import { syncLeaveFromBasecamp } from "@/lib/leave-sync";

/**
 * HR may act on any entry; a manager only on their direct reports'.
 * Returns null when the entry doesn't exist.
 */
async function requireLeaveReviewer(entryId: string) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const entry = await db.leaveEntry.findUnique({
    where: { id: entryId },
    select: { employee: { select: { manager: { select: { userId: true } } } } },
  });
  if (!entry) return null;
  if (user.role === "MANAGER" && entry.employee?.manager?.userId !== user.id) {
    throw new AuthorizationError();
  }
  return user;
}

export type LeaveSyncState = { error?: string; ok?: string };

export async function syncLeave(): Promise<LeaveSyncState> {
  const user = await requireRole("HR_ADMIN");
  try {
    const r = await syncLeaveFromBasecamp(user.id);
    revalidatePath("/leave");
    revalidatePath("/me");
    return {
      ok:
        `Fetched ${r.fetched}, added ${r.created}, updated ${r.updated}, classified ${r.classified}.` +
        (r.remaining > 0
          ? ` ${r.remaining} still to classify — sync again.`
          : ""),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed" };
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  days: z.coerce.number().min(0).max(99),
});

export type LeaveEditState = { error?: string; ok?: boolean };

export async function updateLeaveEntry(
  _prev: LeaveEditState,
  formData: FormData,
): Promise<LeaveEditState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? undefined,
    days: formData.get("days"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  }

  if (!(await requireLeaveReviewer(parsed.data.id))) {
    return { error: "Entry not found" };
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = parsed.data.endDate
    ? new Date(parsed.data.endDate)
    : startDate;
  if (endDate < startDate) return { error: "End date is before start date" };

  await db.leaveEntry.update({
    where: { id: parsed.data.id },
    data: {
      type: parsed.data.type,
      startDate,
      endDate,
      days: parsed.data.days,
      classifiedBy: "manual",
    },
  });
  revalidatePath("/leave");
  revalidatePath("/me");
  return { ok: true };
}

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED", "PENDING"]),
});

/** Approve / reject a leave post (PENDING = undo a decision). */
export async function reviewLeave(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) throw new Error("Invalid review");

  const user = await requireLeaveReviewer(parsed.data.id);
  if (!user) return;

  const undo = parsed.data.decision === "PENDING";
  await db.leaveEntry.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.decision,
      reviewedById: undo ? null : user.id,
      reviewedAt: undo ? null : new Date(),
    },
  });
  revalidatePath("/leave");
  revalidatePath("/me");
}

export type LeaveHistory = {
  daysThisYear: number;
  entries: {
    id: string;
    date: string;
    type: string | null;
    days: number | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    message: string;
  }[];
};

/** The poster's recent leave, for the History drawer in the edit modal. */
export async function getLeaveHistory(entryId: string): Promise<LeaveHistory> {
  if (!(await requireLeaveReviewer(entryId))) {
    return { daysThisYear: 0, entries: [] };
  }
  const entry = await db.leaveEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { employeeId: true, creatorEmail: true },
  });
  // Unmatched posts have no employee; fall back to the Basecamp email.
  const person = entry.employeeId
    ? { employeeId: entry.employeeId }
    : { employeeId: null, creatorEmail: entry.creatorEmail };

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [rows, agg] = await Promise.all([
    db.leaveEntry.findMany({
      where: person,
      orderBy: [{ postedOn: "desc" }, { postedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        startDate: true,
        postedOn: true,
        type: true,
        days: true,
        status: true,
        message: true,
      },
    }),
    db.leaveEntry.aggregate({
      where: {
        ...person,
        type: { in: ["FULL_DAY", "HALF_DAY"] },
        status: { not: "REJECTED" },
        startDate: { gte: yearStart },
      },
      _sum: { days: true },
    }),
  ]);

  return {
    daysThisYear: Number(agg._sum.days ?? 0),
    entries: rows.map((r) => ({
      id: r.id,
      date: (r.startDate ?? r.postedOn).toISOString().slice(0, 10),
      type: r.type,
      days: r.days !== null ? Number(r.days) : null,
      status: r.status,
      message: r.message,
    })),
  };
}
