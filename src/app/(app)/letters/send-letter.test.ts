import { beforeEach, describe, expect, it, vi } from "vitest";

// sendLetter: no blanks left in, and no double sends.

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  letter: { findFirst: vi.fn(), create: vi.fn() },
}));
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ skipped: false })));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => ({ id: "hr1", role: "HR_ADMIN" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendLetter } = await import("./actions");
const { unfilledPlaceholders } = await import("@/lib/letter-templates");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ employeeId: "e1", type: "COMPENSATION", ...fields }))
    data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.letter.findFirst.mockResolvedValue(null);
  db.employee.findUnique.mockResolvedValue({ workEmail: "asha@x.com" });
});

describe("unfilledPlaceholders", () => {
  it("finds [Enter …] notes and {{placeholders}}", () => {
    expect(unfilledPlaceholders("<p>[Enter revised compensation details]</p><p>Dear {{name}},</p>")).toEqual([
      "[Enter revised compensation details]",
      "{{name}}",
    ]);
    expect(unfilledPlaceholders("<p>Dear Asha, your [new] role…</p>")).toEqual([]);
  });
});

describe("sendLetter", () => {
  it("won't send with a blank still in the body", async () => {
    const state = await sendLetter(
      {},
      form({ subject: "Revision", bodyHtml: "<p>[Enter revised compensation details]</p>" }),
    );
    expect(state.fieldErrors?.bodyHtml?.[0]).toMatch(/Fill in \[Enter revised compensation details\]/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("won't send with a placeholder left in the subject", async () => {
    const state = await sendLetter({}, form({ subject: "Offer — {{name}}", bodyHtml: "<p>Welcome</p>" }));
    expect(state.fieldErrors?.subject?.[0]).toMatch(/\{\{name\}\}/);
  });

  it("refuses an identical letter sent moments ago", async () => {
    db.letter.findFirst.mockResolvedValue({ id: "l1" });
    const state = await sendLetter({}, form({ subject: "Revision", bodyHtml: "<p>Your new salary is 10.</p>" }));
    expect(state.error).toMatch(/just sent/);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.letter.findFirst.mock.calls[0][0].where.createdAt.gt).toBeInstanceOf(Date);
  });

  it("sends and archives a complete letter", async () => {
    const state = await sendLetter({}, form({ subject: "Revision", bodyHtml: "<p>Your new salary is 10.</p>" }));
    expect(state).toEqual({ ok: true, error: undefined });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(db.letter.create).toHaveBeenCalledTimes(1);
  });
});
