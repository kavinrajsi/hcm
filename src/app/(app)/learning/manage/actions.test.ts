import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  course: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  courseSection: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  lesson: { aggregate: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  courseFaq: { aggregate: vi.fn(), create: vi.fn() },
  liveClass: { create: vi.fn() },
  employee: { count: vi.fn(), findUnique: vi.fn() },
  courseAssignment: { create: vi.fn() },
}));
const rbac = vi.hoisted(() => ({ requireRole: vi.fn() }));
const files = vi.hoisted(() => ({ blobExists: vi.fn(async () => true), deleteLearningFile: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => rbac);
vi.mock("@/lib/learning/files", () => files);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
}));

const actions = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  rbac.requireRole.mockResolvedValue({ id: "hr", role: "HR_ADMIN" });
  db.courseSection.findUnique.mockResolvedValue({ courseId: "c1" });
  db.lesson.aggregate.mockResolvedValue({ _max: { position: 1 } });
  db.courseFaq.aggregate.mockResolvedValue({ _max: { position: null } });
});

describe("authoring is for HR admins and managers", () => {
  it("asks for an author role on every write", async () => {
    rbac.requireRole.mockRejectedValue(new Error("Not authorized"));
    await expect(actions.addFaq("c1", {}, form({ question: "Q", answer: "A" }))).rejects.toThrow("Not authorized");
    expect(rbac.requireRole).toHaveBeenCalledWith("HR_ADMIN", "MANAGER");
    expect(db.courseFaq.create).not.toHaveBeenCalled();
  });
});

describe("addLesson", () => {
  const base = { title: "Intro", notes: "", durationMins: "" };

  it("needs an uploaded file for PDF and video lessons", async () => {
    const state = await actions.addLesson("s1", {}, form({ ...base, kind: "PDF", fileKey: "" }));
    expect(state.fieldErrors?.fileKey).toEqual(["Upload the PDF first"]);
    expect(db.lesson.create).not.toHaveBeenCalled();
  });

  it("refuses a file that never finished uploading", async () => {
    files.blobExists.mockResolvedValueOnce(false);
    const state = await actions.addLesson("s1", {}, form({ ...base, kind: "VIDEO", fileKey: "learning/video/x.mp4" }));
    expect(state.fieldErrors?.fileKey).toBeDefined();
  });

  it("refuses a non-YouTube link for a YouTube lesson", async () => {
    const state = await actions.addLesson("s1", {}, form({ ...base, kind: "YOUTUBE", url: "https://vimeo.com/123456" }));
    expect(state.fieldErrors?.url).toEqual(["Paste a YouTube video link"]);
  });

  it("saves a YouTube lesson at the end of the section, with sanitized notes", async () => {
    const state = await actions.addLesson(
      "s1",
      {},
      form({
        ...base,
        kind: "YOUTUBE",
        url: "https://youtu.be/dQw4w9WgXcQ",
        notes: '<p>Watch <script>x()</script>this</p>',
        durationMins: "10",
      }),
    );
    expect(state).toEqual({ ok: true });
    expect(db.lesson.create.mock.calls[0][0].data).toMatchObject({
      sectionId: "s1",
      courseId: "c1",
      kind: "YOUTUBE",
      fileKey: null,
      position: 2,
      durationMins: 10,
      notes: "<p>Watch this</p>",
    });
  });
});

describe("FAQs", () => {
  it("adds an FAQ to the end of the list", async () => {
    expect(await actions.addFaq("c1", {}, form({ question: "Is it recorded?", answer: "Yes." }))).toEqual({ ok: true });
    expect(db.courseFaq.create).toHaveBeenCalledWith({
      data: { question: "Is it recorded?", answer: "Yes.", courseId: "c1", position: 0 },
    });
  });

  it("puts missing answers under the field", async () => {
    const state = await actions.addFaq("c1", {}, form({ question: "Q", answer: " " }));
    expect(state.fieldErrors?.answer).toEqual(["Answer is required"]);
  });
});

describe("addLiveClass", () => {
  it("reads times as Indian time", async () => {
    await actions.addLiveClass(
      "c1",
      {},
      form({ title: "Live", startsAt: "2026-10-05T18:00", endsAt: "2026-10-05T19:30", trainer: "", meetingUrl: "", recordingUrl: "" }),
    );
    const { data } = db.liveClass.create.mock.calls[0][0];
    expect(data.startsAt.toISOString()).toBe("2026-10-05T12:30:00.000Z");
    expect(data.meetingUrl).toBeNull();
  });

  it("refuses an end before the start", async () => {
    const state = await actions.addLiveClass(
      "c1",
      {},
      form({ title: "Live", startsAt: "2026-10-05T18:00", endsAt: "2026-10-05T17:00", trainer: "", meetingUrl: "", recordingUrl: "" }),
    );
    expect(state.fieldErrors?.endsAt).toEqual(["Ends after it starts"]);
  });
});

describe("addAssignment", () => {
  it("assigns a person by their HCM login", async () => {
    db.employee.findUnique.mockResolvedValue({ userId: "u9" });
    const state = await actions.addAssignment("c1", {}, form({ target: "USER", employeeId: "e9", dueDate: "2026-10-31" }));
    expect(state).toEqual({ ok: true });
    expect(db.courseAssignment.create.mock.calls[0][0].data).toMatchObject({
      target: "USER",
      userId: "u9",
      department: null,
    });
  });

  it("can't assign someone without a login", async () => {
    db.employee.findUnique.mockResolvedValue({ userId: null });
    const state = await actions.addAssignment("c1", {}, form({ target: "USER", employeeId: "e9", dueDate: "" }));
    expect(state.fieldErrors?.employeeId).toEqual(["That person has no HCM login yet"]);
  });
});
