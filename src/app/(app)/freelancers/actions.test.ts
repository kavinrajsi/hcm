import { beforeEach, describe, expect, it, vi } from "vitest";

// Freelancer actions: every field is required, and notes become the first
// entry of the timeline.

const db = vi.hoisted(() => ({
  freelancer: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { addFreelancer, addFreelancerNote, updateFreelancer } = await import("./actions");
const { parseNotes } = await import("@/app/(app)/candidates/notes");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const complete = {
  name: "Meena",
  phone: "9876543210",
  email: "meena@example.com",
  skillset: "Illustration",
  profileUrl: "behance.net/meena",
  rate: "₹2500/day",
  availability: "AVAILABLE",
  notes: "<p>Met at the design meetup</p>",
};

beforeEach(() => vi.clearAllMocks());

describe("addFreelancer", () => {
  it("adds a complete freelancer with the note as the first timeline entry", async () => {
    const state = await addFreelancer({}, form(complete));
    expect(state).toEqual({ ok: true });

    const data = db.freelancer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: "Meena",
      email: "meena@example.com",
      profileUrl: "https://behance.net/meena",
      availability: "AVAILABLE",
    });
    expect(parseNotes(data.notes)).toMatchObject([
      { text: "<p>Met at the design meetup</p>", timestamp: expect.any(String) },
    ]);
  });

  it("requires every field", async () => {
    const state = await addFreelancer({}, form({}));
    for (const field of ["name", "phone", "email", "skillset", "profileUrl", "rate", "availability", "notes"]) {
      expect(state.fieldErrors?.[field], field).toBeDefined();
    }
    expect(db.freelancer.create).not.toHaveBeenCalled();
  });

  it("checks the email and profile URL", async () => {
    const state = await addFreelancer(
      {},
      form({ ...complete, email: "not-an-email", profileUrl: "http://" }),
    );
    expect(state.fieldErrors?.email?.[0]).toMatch(/valid email/);
    expect(state.fieldErrors?.profileUrl?.[0]).toMatch(/web address/);
    expect(db.freelancer.create).not.toHaveBeenCalled();
  });

  it("treats a note with only formatting or spaces as empty", async () => {
    const state = await addFreelancer({}, form({ ...complete, notes: "<p>&nbsp; </p>" }));
    expect(state.fieldErrors?.notes?.[0]).toMatch(/Note is required/);
  });
});

describe("updateFreelancer", () => {
  it("updates the details and leaves the timeline alone", async () => {
    await updateFreelancer("f1", {}, form({ ...complete, notes: "new note" }));
    const data = db.freelancer.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("notes");
    expect(data).toMatchObject({ name: "Meena", rate: "₹2500/day" });
  });
});

describe("addFreelancerNote", () => {
  it("appends to the existing timeline", async () => {
    db.freelancer.findUnique.mockResolvedValue({
      notes: JSON.stringify([{ id: "1", text: "first", timestamp: "2026-10-01T00:00:00.000Z" }]),
    });
    const state = await addFreelancerNote({}, form({ id: "f1", text: "<p>Call back</p>" }));
    expect(state).toEqual({ ok: true });

    const notes = parseNotes(db.freelancer.update.mock.calls[0][0].data.notes);
    expect(notes.map((note) => note.text)).toEqual(["first", "<p>Call back</p>"]);
  });

  it("refuses an empty note", async () => {
    const state = await addFreelancerNote({}, form({ id: "f1", text: "  " }));
    expect(state.fieldErrors?.text?.[0]).toMatch(/Note is empty/);
    expect(db.freelancer.update).not.toHaveBeenCalled();
  });
});
