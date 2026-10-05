import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findUnique: vi.fn() },
  course: { count: vi.fn() },
  announcement: { create: vi.fn() },
  announcementRead: { createMany: vi.fn() },
}));
const access = vi.hoisted(() => ({ AUTHOR_ROLES: ["HR_ADMIN", "MANAGER"], canOpenCourse: vi.fn() }));
const progress = vi.hoisted(() => ({ completeLesson: vi.fn(), touchEnrollment: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/learning/access", () => access);
vi.mock("@/lib/learning/progress", () => progress);
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", role: "EMPLOYEE" })),
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.lesson.findUnique.mockResolvedValue({ courseId: "c1" });
});

describe("markLessonComplete", () => {
  it("won't record progress on a course the person can't open", async () => {
    access.canOpenCourse.mockResolvedValue(false);
    expect(await actions.markLessonComplete("l1")).toBeNull();
    expect(progress.completeLesson).not.toHaveBeenCalled();
  });

  it("records it for the signed-in person", async () => {
    access.canOpenCourse.mockResolvedValue(true);
    progress.completeLesson.mockResolvedValue({ courseId: "c1", nextLessonId: "l2", courseCompleted: false });
    expect(await actions.markLessonComplete("l1")).toMatchObject({ nextLessonId: "l2" });
    expect(progress.completeLesson).toHaveBeenCalledWith("u1", "l1");
  });
});

describe("recordVisit", () => {
  it("ignores a lesson from another course", async () => {
    access.canOpenCourse.mockResolvedValue(true);
    db.lesson.findUnique.mockResolvedValue({ courseId: "other" });
    await actions.recordVisit("c1", "l1");
    expect(progress.touchEnrollment).not.toHaveBeenCalled();
  });
});

describe("announcements", () => {
  it("marks read without duplicates", async () => {
    await actions.markAnnouncementsRead(["a1", "a2"]);
    expect(db.announcementRead.createMany).toHaveBeenCalledWith({
      data: [
        { announcementId: "a1", userId: "u1" },
        { announcementId: "a2", userId: "u1" },
      ],
      skipDuplicates: true,
    });
  });

  it("posts a sanitized announcement", async () => {
    const data = new FormData();
    data.set("title", "Deadline moved");
    data.set("body", '<p onclick="x()">Now <b>Friday</b></p>');
    data.set("urgency", "HIGH");
    data.set("courseId", "");
    expect(await actions.createAnnouncement({}, data)).toEqual({ ok: true });
    expect(db.announcement.create.mock.calls[0][0].data).toEqual({
      title: "Deadline moved",
      body: "<p>Now <b>Friday</b></p>",
      urgency: "HIGH",
      courseId: null,
      createdById: "hr",
    });
  });

  it("refuses an empty message", async () => {
    const data = new FormData();
    data.set("title", "T");
    data.set("body", "<p></p>");
    data.set("urgency", "NONE");
    expect((await actions.createAnnouncement({}, data)).fieldErrors?.body).toBeDefined();
  });
});
