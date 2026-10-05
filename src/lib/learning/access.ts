import { cache } from "react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

// Who may see which course. Authors (HR admins and managers) open any
// course, drafts included. Everyone else sees published courses that are
// open to all (Explore) or assigned to everyone, their department, or them.
// The department comes from the employee record linked to the login by
// userId only — never matched by email.

export const AUTHOR_ROLES: Role[] = ["HR_ADMIN", "MANAGER"];

type Viewer = { id: string; role: Role };

export function isAuthor(user: Viewer): boolean {
  return AUTHOR_ROLES.includes(user.role);
}

export const myDepartment = cache(async (userId: string): Promise<string | null> => {
  const employee = await db.employee.findFirst({
    where: { userId },
    select: { department: true },
  });
  return employee?.department ?? null;
});

function assignmentMatch(userId: string, department: string | null): Prisma.CourseAssignmentWhereInput {
  return {
    OR: [
      { target: "ALL" },
      { target: "USER", userId },
      ...(department ? [{ target: "DEPARTMENT" as const, department }] : []),
    ],
  };
}

/** Published courses this person may take: open to all, or assigned to them. */
export async function learnerCourseWhere(user: Viewer): Promise<Prisma.CourseWhereInput> {
  const department = await myDepartment(user.id);
  return {
    status: "PUBLISHED",
    OR: [{ openToAll: true }, { assignments: { some: assignmentMatch(user.id, department) } }],
  };
}

/** Courses assigned to this person, with the earliest due date that applies. */
export async function myAssignments(user: Viewer): Promise<Map<string, Date | null>> {
  const department = await myDepartment(user.id);
  const rows = await db.courseAssignment.findMany({
    where: { ...assignmentMatch(user.id, department), course: { status: "PUBLISHED" } },
    select: { courseId: true, dueDate: true },
  });
  const due = new Map<string, Date | null>();
  for (const row of rows) {
    const current = due.get(row.courseId);
    if (!due.has(row.courseId)) due.set(row.courseId, row.dueDate);
    else if (row.dueDate && (!current || row.dueDate < current)) due.set(row.courseId, row.dueDate);
  }
  return due;
}

export async function canOpenCourse(user: Viewer, courseId: string): Promise<boolean> {
  if (isAuthor(user)) {
    return (await db.course.count({ where: { id: courseId } })) > 0;
  }
  const where = await learnerCourseWhere(user);
  return (await db.course.count({ where: { AND: [{ id: courseId }, where] } })) > 0;
}
