import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findUnique: vi.fn(), groupBy: vi.fn() },
  lessonProgress: { upsert: vi.fn(), groupBy: vi.fn() },
  courseSection: { findMany: vi.fn() },
  courseEnrollment: { upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const progress = await import("./progress");

beforeEach(() => {
  vi.clearAllMocks();
  db.courseSection.findMany.mockResolvedValue([
    { lessons: [{ id: "l1" }, { id: "l2" }] },
    { lessons: [{ id: "l3" }] },
  ]);
  db.lesson.findUnique.mockResolvedValue({ id: "l2", courseId: "c1" });
  db.lesson.groupBy.mockResolvedValue([{ courseId: "c1", _count: { _all: 3 } }]);
});

describe("toProgress", () => {
  it("rounds percent and handles empty courses", () => {
    expect(progress.toProgress(1, 3)).toEqual({ done: 1, total: 3, percent: 33 });
    expect(progress.toProgress(0, 0)).toEqual({ done: 0, total: 0, percent: 0 });
    expect(progress.isComplete(progress.toProgress(0, 0))).toBe(false);
    expect(progress.isComplete(progress.toProgress(3, 3))).toBe(true);
  });
});

describe("courseProgress", () => {
  it("never reports more done than there are lessons (deleted lessons)", async () => {
    db.lessonProgress.groupBy.mockResolvedValue([{ courseId: "c1", _count: { _all: 5 } }]);
    const result = await progress.courseProgress("u1", ["c1", "c2"]);
    expect(result.get("c1")).toEqual({ done: 3, total: 3, percent: 100 });
    expect(result.get("c2")).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("completeLesson", () => {
  it("records the lesson and points at the next one in reading order", async () => {
    db.lessonProgress.groupBy.mockResolvedValue([{ courseId: "c1", _count: { _all: 2 } }]);
    const result = await progress.completeLesson("u1", "l2");
    expect(result).toEqual({ courseId: "c1", nextLessonId: "l3", courseCompleted: false });
    expect(db.lessonProgress.upsert.mock.calls[0][0].create).toEqual({ lessonId: "l2", userId: "u1", courseId: "c1" });
    expect(db.courseEnrollment.upsert.mock.calls[0][0].update.lastLessonId).toBe("l3");
  });

  it("marks the course complete after the last lesson", async () => {
    db.lesson.findUnique.mockResolvedValue({ id: "l3", courseId: "c1" });
    db.lessonProgress.groupBy.mockResolvedValue([{ courseId: "c1", _count: { _all: 3 } }]);
    const result = await progress.completeLesson("u1", "l3");
    expect(result).toEqual({ courseId: "c1", nextLessonId: null, courseCompleted: true });
    expect(db.courseEnrollment.upsert.mock.calls[0][0].update.completedAt).toBeInstanceOf(Date);
  });

  it("ignores a lesson that doesn't exist", async () => {
    db.lesson.findUnique.mockResolvedValue(null);
    expect(await progress.completeLesson("u1", "nope")).toBeNull();
    expect(db.lessonProgress.upsert).not.toHaveBeenCalled();
  });
});
