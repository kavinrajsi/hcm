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
  rateAmount: "2500",
  rateUnit: "day",
  rateOtherUnit: "",
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
    for (const field of ["name", "phone", "email", "skillset", "profileUrl", "rateAmount", "rateUnit", "availability", "notes"]) {
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

describe("field rules", () => {
  const bad = async (fields: Record<string, string>, field: string, message: RegExp) => {
    db.freelancer.create.mockClear();
    const state = await addFreelancer({}, form({ ...complete, ...fields }));
    expect(state.fieldErrors?.[field]?.[0], field).toMatch(message);
    expect(db.freelancer.create).not.toHaveBeenCalled();
  };

  it("needs letters in the name and skill set", async () => {
    await bad({ name: "1234" }, "name", /must contain letters/);
    await bad({ skillset: "***" }, "skillset", /at least one skill/);
  });

  it("checks the phone number has 7 to 15 digits and no letters", async () => {
    await bad({ phone: "12345" }, "phone", /7 to 15 digits/);
    await bad({ phone: "98765 abc12" }, "phone", /7 to 15 digits/);
    await bad({ phone: "1234567890123456" }, "phone", /7 to 15 digits/);
  });

  it("accepts a phone number with spaces, brackets and a plus", async () => {
    const state = await addFreelancer({}, form({ ...complete, phone: "+91 (98765) 43210" }));
    expect(state).toEqual({ ok: true });
  });

  it("takes the rate as an amount in numbers", async () => {
    await bad({ rateAmount: "2,500" }, "rateAmount", /Numbers only/);
    await bad({ rateAmount: "₹2500" }, "rateAmount", /Numbers only/);
  });

  it("refuses a profile URL with no real domain", async () => {
    await bad({ profileUrl: "localhost" }, "profileUrl", /web address/);
    await bad({ profileUrl: "ftp://example.com" }, "profileUrl", /web address/);
  });

  it("limits the length of each text field", async () => {
    await bad({ name: "a".repeat(101) }, "name", /at most/);
    await bad({ skillset: "a".repeat(201) }, "skillset", /at most/);
    await bad({ rateOtherUnit: "a".repeat(21), rateUnit: "other" }, "rateOtherUnit", /At most 20/);
    await bad({ email: `${"a".repeat(250)}@x.com` }, "email", /at most|valid email/);
  });
});

describe("rate", () => {
  it("stores the amount with the rupee sign and the unit", async () => {
    await addFreelancer({}, form({ ...complete, rateAmount: "2500", rateUnit: "reel" }));
    expect(db.freelancer.create.mock.calls.at(-1)?.[0].data.rate).toBe("₹2500/reel");
  });

  it("takes a typed unit when Other is picked", async () => {
    await addFreelancer({}, form({ ...complete, rateAmount: "800", rateUnit: "other", rateOtherUnit: "Shoot" }));
    expect(db.freelancer.create.mock.calls.at(-1)?.[0].data.rate).toBe("₹800/shoot");
  });

  it("accepts letters, numbers and spaces in the typed unit", async () => {
    await addFreelancer({}, form({ ...complete, rateAmount: "1500", rateUnit: "other", rateOtherUnit: "2 Reels" }));
    expect(db.freelancer.create.mock.calls.at(-1)?.[0].data.rate).toBe("₹1500/2 reels");
  });

  it("asks for the unit and refuses symbols in it", async () => {
    const missing = await addFreelancer({}, form({ ...complete, rateUnit: "" }));
    expect(missing.fieldErrors?.rateUnit?.[0]).toMatch(/Pick what/);
    const other = await addFreelancer({}, form({ ...complete, rateUnit: "other", rateOtherUnit: "" }));
    expect(other.fieldErrors?.rateOtherUnit?.[0]).toMatch(/Enter the unit/);
    const symbols = await addFreelancer({}, form({ ...complete, rateUnit: "other", rateOtherUnit: "shoot!" }));
    expect(symbols.fieldErrors?.rateOtherUnit?.[0]).toMatch(/letters, numbers and spaces/);
  });
});

