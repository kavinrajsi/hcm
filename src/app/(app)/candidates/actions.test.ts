import { beforeEach, describe, expect, it, vi } from "vitest";

// Candidate form actions: problems land under the input they're about.

const db = vi.hoisted(() => ({ candidate: { create: vi.fn() } }));
const uploadResume = vi.hoisted(() => vi.fn());
const addNoteToCandidate = vi.hoisted(() => vi.fn());
const moveCandidate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/blob", () => ({ uploadResume }));
vi.mock("@/lib/hcm-ops", () => ({ addNoteToCandidate, moveCandidate }));

const actions = await import("./actions");

const form = (values: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const candidate = (extra: Record<string, string | File> = {}) =>
  form({ firstName: "Asha", position: "Intern", status: "New", ...extra });

beforeEach(() => vi.clearAllMocks());

describe("createCandidate", () => {
  it("adds a valid candidate", async () => {
    const state = await actions.createCandidate({}, candidate());
    expect(state).toEqual({ ok: true });
    expect(db.candidate.create).toHaveBeenCalled();
  });

  it("puts each bad input under its name", async () => {
    const state = await actions.createCandidate(
      {},
      candidate({ firstName: " ", email: "nope", portfolio: "asha.design" }),
    );
    expect(state.fieldErrors?.firstName?.[0]).toBe("First name is required");
    expect(state.fieldErrors?.email?.[0]).toBe("Invalid email");
    expect(state.fieldErrors?.portfolio?.[0]).toMatch(/http/);
    expect(state.error).toBe("Fix the highlighted fields.");
    expect(db.candidate.create).not.toHaveBeenCalled();
  });

  it("flags a wrong resume type on the resume field", async () => {
    const state = await actions.createCandidate(
      {},
      candidate({ resume: new File(["x"], "cv.png", { type: "image/png" }) }),
    );
    expect(state.fieldErrors?.resume?.[0]).toMatch(/PDF, DOC or DOCX/);
    expect(uploadResume).not.toHaveBeenCalled();
  });
});

describe("addCandidateNote", () => {
  it("flags an empty note on the text field", async () => {
    const state = await actions.addCandidateNote({}, form({ id: "7", text: "  " }));
    expect(state.fieldErrors?.text?.[0]).toBe("Note is empty");
    expect(addNoteToCandidate).not.toHaveBeenCalled();
  });
});

describe("updateCandidate", () => {
  it("flags an unknown status on the status field", async () => {
    const state = await actions.updateCandidate({}, form({ id: "7", status: "Hired?" }));
    expect(state.fieldErrors?.status).toBeDefined();
    expect(moveCandidate).not.toHaveBeenCalled();
  });
});
