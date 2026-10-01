import { beforeEach, describe, expect, it, vi } from "vitest";

// Letters templates: drafts use HR's saved template over the built-in one,
// saving sanitises the HTML but keeps placeholders, and only HR may edit.

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  letterTemplate: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
const requireRole = vi.hoisted(() =>
  vi.fn(async () => ({ id: "hr1", role: "HR_ADMIN" })),
);

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({ requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const { generateLetter, resetLetterTemplate, saveLetterTemplate } =
  await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockResolvedValue({
    id: "e1",
    name: "Asha Rao",
    empId: "E1",
    designation: "Designer",
    department: "Design",
    dateOfJoining: new Date("2026-10-01"),
  });
});

describe("letter templates", () => {
  it("drafts from HR's saved template when there is one", async () => {
    db.letterTemplate.findUnique.mockResolvedValue({
      subject: "Welcome {{name}}",
      body: "<p>Hi {{name}}, you join on {{dateOfJoining}}.</p>",
      updatedAt: new Date(),
      updatedBy: null,
    });
    const { draft } = await generateLetter(
      {},
      form({ employeeId: "e1", type: "OFFER" }),
    );
    expect(draft?.subject).toBe("Welcome Asha Rao");
    expect(draft?.bodyHtml).toBe("<p>Hi Asha Rao, you join on 01/10/2026.</p>");
  });

  it("falls back to the built-in template", async () => {
    db.letterTemplate.findUnique.mockResolvedValue(null);
    const { draft } = await generateLetter(
      {},
      form({ employeeId: "e1", type: "INTERN" }),
    );
    expect(draft?.subject).toBe("Internship Offer — Asha Rao");
  });

  it("saves sanitised HTML and keeps placeholders", async () => {
    const result = await saveLetterTemplate(
      {},
      form({
        type: "OFFER",
        subject: "Offer — {{name}}",
        body: '<p class="x">Dear {{name}}</p><script>bad()</script>',
      }),
    );
    expect(result).toEqual({ ok: true });
    const saved = db.letterTemplate.upsert.mock.calls[0][0];
    expect(saved.create.body).toBe(
      '<p style="margin:0 0 12px">Dear {{name}}</p>',
    );
    expect(saved.create.updatedById).toBe("hr1");
  });

  it("rejects an empty body", async () => {
    const result = await saveLetterTemplate(
      {},
      form({ type: "OFFER", subject: "Offer", body: "<p></p>" }),
    );
    expect(result.fieldErrors?.body?.[0]).toBe("Body is required");
    expect(db.letterTemplate.upsert).not.toHaveBeenCalled();
  });

  it("puts a blank subject under the subject field", async () => {
    const result = await saveLetterTemplate(
      {},
      form({ type: "OFFER", subject: " ", body: "<p>Hi</p>" }),
    );
    expect(result.fieldErrors?.subject?.[0]).toBe("Subject is required");
    expect(db.letterTemplate.upsert).not.toHaveBeenCalled();
  });

  it("asks for an employee on the employee field before drafting", async () => {
    const result = await generateLetter({}, form({ employeeId: "", type: "OFFER" }));
    expect(result.fieldErrors?.employeeId?.[0]).toBe("Pick an employee");
    expect(result.draft).toBeUndefined();
  });

  it("requires HR to save or reset", async () => {
    requireRole.mockRejectedValueOnce(new Error("Not authorized"));
    await expect(
      saveLetterTemplate(
        {},
        form({ type: "OFFER", subject: "s", body: "<p>b</p>" }),
      ),
    ).rejects.toThrow("Not authorized");
    requireRole.mockRejectedValueOnce(new Error("Not authorized"));
    await expect(resetLetterTemplate(form({ type: "OFFER" }))).rejects.toThrow(
      "Not authorized",
    );
    expect(db.letterTemplate.deleteMany).not.toHaveBeenCalled();
  });
});
