import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), findMany: vi.fn() },
  probationRecord: { findMany: vi.fn() },
  employmentReminder: { findMany: vi.fn(), createMany: vi.fn() },
}));
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/date-filter", () => ({ istDay: () => "2026-10-01" }));

const { typeChangeEmail, notifyTypeChange, findEndingSoon, sendEndReminders } = await import("./employment-emails");

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ skipped: false, id: "z1" });
  db.employee.findUnique.mockResolvedValue({
    name: "Asha Rao",
    empId: "PBCH0100",
    workEmail: "asha@madarth.com",
    empTypeEndsOn: new Date("2027-03-31"),
    probation: { dueDate: new Date("2026-12-31"), status: "PENDING" },
  });
  db.probationRecord.findMany.mockResolvedValue([]);
  db.employee.findMany.mockResolvedValue([]);
  db.employmentReminder.findMany.mockResolvedValue([]);
  db.employmentReminder.createMany.mockResolvedValue({ count: 0 });
});

describe("typeChangeEmail", () => {
  it("says from what to what, effective when", () => {
    const { subject, html } = typeChangeEmail({
      name: "Asha <Rao>",
      empId: "PBCH0100",
      from: "PROBATION",
      to: "PERMANENT",
      effective: new Date("2026-10-01"),
      endsOn: null,
    });
    expect(subject).toBe("Your employment type is now Permanent");
    expect(html).toContain("Hi Asha,");
    expect(html).toContain("<strong>Probation</strong> to <strong>Permanent</strong>");
    expect(html).toContain("01/10/2026");
    expect(html).not.toContain("ends");
    expect(html).toContain("hr@madarth.com");
  });

  it("adds the end date for a contract", () => {
    const { html } = typeChangeEmail({
      name: "Asha",
      empId: "X",
      from: "PERMANENT",
      to: "CONTRACT",
      effective: new Date("2026-10-01"),
      endsOn: new Date("2027-03-31"),
    });
    expect(html).toContain("Contract ends: <strong>31/03/2027</strong>");
  });
});

describe("notifyTypeChange", () => {
  it("emails the employee, copying HR and Finance, replies to HR", async () => {
    expect(await notifyTypeChange("e1", "PROBATION", "CONTRACT")).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "asha@madarth.com",
        cc: ["hr@madarth.com", "finance@madarth.com"],
        replyTo: "hr@madarth.com",
        subject: "Your employment type is now Contract",
        html: expect.stringContaining("31/03/2027"),
      }),
    );
  });

  it("sends nothing when the type didn't change", async () => {
    expect(await notifyTypeChange("e1", "PERMANENT", "PERMANENT")).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws, even if sending fails", async () => {
    sendEmail.mockRejectedValue(new Error("down"));
    await expect(notifyTypeChange("e1", "PROBATION", "PERMANENT")).resolves.toBe(false);
  });
});

describe("one-week end reminders", () => {
  const probation = { dueDate: new Date("2026-10-05"), employee: { id: "e1", name: "Asha", empId: "P1" } };
  const contract = { id: "e2", name: "Ravi", empId: "P2", empType: "CONTRACT", empTypeEndsOn: new Date("2026-10-08") };
  const intern = { id: "e3", name: "Kim", empId: "P3", empType: "INTERN", empTypeEndsOn: new Date("2026-10-02") };

  it("finds probation, contract and internship ends within 7 days, soonest first", async () => {
    db.probationRecord.findMany.mockResolvedValue([probation]);
    db.employee.findMany.mockResolvedValue([contract, intern]);
    const rows = await findEndingSoon();
    expect(rows.map((row) => [row.empId, row.kind, row.daysLeft])).toEqual([
      ["P3", "internship", 1],
      ["P1", "probation", 4],
      ["P2", "contract", 7],
    ]);
    // Window: today .. today+7, active employees, open probations.
    expect(db.probationRecord.findMany.mock.calls[0][0].where).toMatchObject({
      status: { notIn: ["CONFIRMED", "EXITED"] },
      dueDate: { gte: new Date("2026-10-01T00:00:00Z"), lte: new Date("2026-10-08T00:00:00Z") },
    });
  });

  it("skips anything already reminded for that date", async () => {
    db.probationRecord.findMany.mockResolvedValue([probation]);
    db.employmentReminder.findMany.mockResolvedValue([{ employeeId: "e1", kind: "probation", endsOn: new Date("2026-10-05") }]);
    expect(await findEndingSoon()).toEqual([]);
  });

  it("emails hr@ once and records only after the email is accepted", async () => {
    db.employee.findMany.mockResolvedValue([contract]);
    const result = await sendEndReminders();
    expect(result.emailed).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "hr@madarth.com", subject: "1 employment ending within a week" }));
    expect(db.employmentReminder.createMany).toHaveBeenCalledWith({
      data: [{ employeeId: "e2", kind: "contract", endsOn: new Date("2026-10-08") }],
      skipDuplicates: true,
    });
  });

  it("records nothing when the email didn't go, or on a dry run", async () => {
    db.employee.findMany.mockResolvedValue([contract]);
    sendEmail.mockResolvedValue({ skipped: true });
    await sendEndReminders();
    expect(db.employmentReminder.createMany).not.toHaveBeenCalled();
    sendEmail.mockClear();
    const dry = await sendEndReminders({ dryRun: true });
    expect(dry.rows).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
