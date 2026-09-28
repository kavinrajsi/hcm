import { beforeEach, describe, expect, it, vi } from "vitest";

// A failed email must never lose work: letters are still saved, exits are
// still recorded, and the probation reminder cron only mails active admins.

const db = vi.hoisted(() => {
  const mockDb = {
    employee: { findUnique: vi.fn(), update: vi.fn() },
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    idCard: { update: vi.fn() },
    probationRecord: { update: vi.fn(), findMany: vi.fn() },
    letter: { create: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (transaction: unknown) => unknown)(mockDb),
    ),
  };
  return mockDb;
});
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendLetter } = await import("./letters/actions");
const { markExit } = await import("./exit/actions");
const { GET: probationCron } =
  await import("../api/cron/probation-reminders/route");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sendLetter", () => {
  const letter = form({
    employeeId: "e1",
    type: "COMPENSATION",
    subject: "Revised compensation",
    bodyHtml: "<p>Dear Asha</p>",
  });

  beforeEach(() => {
    db.employee.findUnique.mockResolvedValue({ workEmail: "asha@madarth.com" });
  });

  it("emails the letter in the branded frame and records it as sent", async () => {
    sendEmail.mockResolvedValue({ skipped: false, id: "m1" });
    const result = await sendLetter({}, letter);
    expect(result).toEqual({ ok: true, error: undefined });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("asha@madarth.com");
    expect(mail.subject).toBe("Revised compensation");
    expect(mail.html).toContain("<p>Dear Asha</p>");
    expect(mail.html).toContain("HCM · Madarth");
    expect(db.letter.create.mock.calls[0][0].data.sentTo).toBe(
      "asha@madarth.com",
    );
  });

  it("still saves the letter (unsent) when sending fails", async () => {
    sendEmail.mockRejectedValue(new Error("Email send failed: TM_4001"));
    const result = await sendLetter({}, letter);
    expect(result.ok).toBe(true);
    expect(result.error).toMatch(/couldn't be sent/);
    expect(db.letter.create.mock.calls[0][0].data).toMatchObject({
      sentAt: null,
      sentTo: null,
    });
  });
});

describe("markExit", () => {
  it("records the exit even if the clearance email fails", async () => {
    db.employee.findUnique.mockResolvedValue({
      id: "e1",
      name: "Asha",
      empId: "E1",
      workEmail: "asha@x.com",
      dateOfExit: null,
      userId: null,
      idCard: null,
      probation: null,
    });
    sendEmail.mockRejectedValue(new Error("down"));
    const result = await markExit(
      {},
      form({ employeeId: "e1", dateOfExit: "2026-10-31" }),
    );
    expect(result).toEqual({ ok: true });
    expect(db.employee.update).toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][0].subject).toBe(
      "Exit clearance — Asha (E1)",
    );
  });
});

describe("probation reminder cron", () => {
  const request = {
    headers: new Headers({ authorization: "Bearer test-secret" }),
  } as never;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    db.probationRecord.findMany.mockResolvedValue([
      {
        dueDate: new Date("2026-10-05"),
        status: "PENDING",
        employee: { name: "Asha", empId: "E1" },
      },
    ]);
    db.user.findMany.mockResolvedValue([{ email: "hr@madarth.com" }]);
  });

  it("refuses requests without the right secret", async () => {
    const response = await probationCron({ headers: new Headers() } as never);
    expect(response.status).toBe(401);
    delete process.env.CRON_SECRET; // unset secret must not open the route
    expect((await probationCron(request)).status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails only active HR admins", async () => {
    sendEmail.mockResolvedValue({ skipped: false });
    const response = await probationCron(request);
    expect(await response.json()).toEqual({ due: 1, emailed: true });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      role: "HR_ADMIN",
      disabledAt: null,
    });
    expect(sendEmail.mock.calls[0][0].to).toEqual(["hr@madarth.com"]);
  });

  it("reports emailed:false instead of crashing when sending fails", async () => {
    sendEmail.mockRejectedValue(new Error("down"));
    const response = await probationCron(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ due: 1, emailed: false });
  });
});
