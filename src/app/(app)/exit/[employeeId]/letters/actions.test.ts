import { beforeEach, describe, expect, it, vi } from "vitest";

// Exit letters: only for exited employees, only the types their emp type
// gets, signed by the saved signatory, and stored as a PDF on the record.

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  letter: { create: vi.fn() },
}));
const uploadDocument = vi.hoisted(() => vi.fn(async () => "exit-letters/MAD-1/relieving-x.pdf"));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => ({ id: "hr1", role: "HR_ADMIN" })) }));
vi.mock("@/lib/blob", () => ({ uploadDocument }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { generateExitLetter, saveExitLetterSignatory } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const leaver = {
  id: "e1",
  empId: "MAD-1",
  name: "Asha Rao",
  designation: "Designer",
  department: "Design",
  dateOfJoining: new Date("2025-03-03T00:00:00Z"),
  dateOfExit: new Date("2026-10-27T00:00:00Z"),
  empType: "PERMANENT",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockResolvedValue(leaver);
  db.appSetting.findUnique.mockResolvedValue({
    value: { name: "Priya Nair", designation: "HR Manager" },
  });
  db.letter.create.mockResolvedValue({ id: "l1" });
});

describe("generateExitLetter", () => {
  it("refuses an employee who has not exited", async () => {
    db.employee.findUnique.mockResolvedValue({ ...leaver, dateOfExit: null });
    const result = await generateExitLetter({}, form({ employeeId: "e1", type: "RELIEVING" }));
    expect(result.error).toMatch(/Record the exit/);
    expect(db.letter.create).not.toHaveBeenCalled();
  });

  it("refuses a letter that does not apply to the emp type", async () => {
    const result = await generateExitLetter({}, form({ employeeId: "e1", type: "INTERNSHIP_CERTIFICATE" }));
    expect(result.fieldErrors?.type).toBeDefined();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("needs a saved signatory first", async () => {
    db.appSetting.findUnique.mockResolvedValue(null);
    const result = await generateExitLetter({}, form({ employeeId: "e1", type: "RELIEVING" }));
    expect(result.error).toMatch(/Save who signs/);
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("uploads the PDF and records the letter with its blob key", async () => {
    const result = await generateExitLetter({}, form({ employeeId: "e1", type: "RELIEVING" }));
    expect(result.ok).toBe("Relieving letter created.");

    const [pathname, file] = uploadDocument.mock.calls[0] as unknown as [string, Buffer];
    expect(pathname).toMatch(/^exit-letters\/MAD-1\/relieving-.*\.pdf$/);
    expect(file.subarray(0, 5).toString()).toBe("%PDF-");

    const { data } = db.letter.create.mock.calls[0][0];
    expect(data).toMatchObject({
      employeeId: "e1",
      type: "RELIEVING",
      pdfBlobKey: "exit-letters/MAD-1/relieving-x.pdf",
    });
    expect(data.subject).toBe("Relieving Letter — Asha Rao");
    expect(data.bodyHtml).toContain("27/10/2026");
  });
});

describe("saveExitLetterSignatory", () => {
  it("needs a name and designation", async () => {
    const result = await saveExitLetterSignatory({}, form({ name: " ", designation: "HR" }));
    expect(result.fieldErrors?.name).toBeDefined();
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("saves under the signatory key", async () => {
    const result = await saveExitLetterSignatory({}, form({ name: "Priya Nair", designation: "HR Manager" }));
    expect(result.ok).toMatch(/Signatory saved/);
    expect(db.appSetting.upsert.mock.calls[0][0]).toMatchObject({
      where: { key: "exitLetterSignatory" },
      create: { value: { name: "Priya Nair", designation: "HR Manager" }, updatedById: "hr1" },
    });
  });
});
