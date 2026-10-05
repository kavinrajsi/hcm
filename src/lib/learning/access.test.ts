import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { findFirst: vi.fn() },
  course: { count: vi.fn() },
  courseAssignment: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));

const access = await import("./access");
const learner = { id: "u1", role: "EMPLOYEE" as const };

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findFirst.mockResolvedValue({ department: "Design" });
});

describe("learnerCourseWhere", () => {
  it("is published courses that are open, or assigned to everyone, my department or me", async () => {
    expect(await access.learnerCourseWhere(learner)).toEqual({
      status: "PUBLISHED",
      OR: [
        { openToAll: true },
        {
          assignments: {
            some: {
              OR: [{ target: "ALL" }, { target: "USER", userId: "u1" }, { target: "DEPARTMENT", department: "Design" }],
            },
          },
        },
      ],
    });
    // The department comes from the employee linked by userId, never by email.
    expect(db.employee.findFirst).toHaveBeenCalledWith({ where: { userId: "u1" }, select: { department: true } });
  });

  it("skips department matching when there's no employee record", async () => {
    db.employee.findFirst.mockResolvedValue(null);
    const where = await access.learnerCourseWhere(learner);
    expect(JSON.stringify(where)).not.toContain("DEPARTMENT");
  });
});

describe("canOpenCourse", () => {
  it("lets authors open any course, drafts included", async () => {
    db.course.count.mockResolvedValue(1);
    expect(await access.canOpenCourse({ id: "m", role: "MANAGER" }, "c1")).toBe(true);
    expect(db.course.count).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("checks a learner against the visibility rules", async () => {
    db.course.count.mockResolvedValue(0);
    expect(await access.canOpenCourse(learner, "c1")).toBe(false);
    const { where } = db.course.count.mock.calls[0][0];
    expect(where.AND[0]).toEqual({ id: "c1" });
    expect(where.AND[1].status).toBe("PUBLISHED");
  });
});

describe("myAssignments", () => {
  it("keeps the earliest due date per course", async () => {
    db.courseAssignment.findMany.mockResolvedValue([
      { courseId: "c1", dueDate: new Date("2026-11-01") },
      { courseId: "c1", dueDate: new Date("2026-10-15") },
      { courseId: "c1", dueDate: null },
      { courseId: "c2", dueDate: null },
    ]);
    const due = await access.myAssignments(learner);
    expect(due.get("c1")?.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(due.has("c2")).toBe(true);
    expect(due.get("c2")).toBeNull();
  });
});
