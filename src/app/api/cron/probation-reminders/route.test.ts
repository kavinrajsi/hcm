import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ probationRecord: { findMany: vi.fn() } }));
type SentEmail = { to: string | string[]; subject: string };
const sendEmail = vi.hoisted(() => vi.fn<(email: SentEmail) => Promise<{ skipped: boolean }>>());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { GET } = await import("./route");

const run = () =>
  GET(new NextRequest("https://h/api/cron/probation-reminders", { headers: { authorization: "Bearer cron-secret" } }));

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ skipped: false });
  process.env.CRON_SECRET = "cron-secret";
});

describe("probation reminders", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/probation-reminders"))).status).toBe(401);
  });

  it("lists only open probations past their due date, of people still employed", async () => {
    db.probationRecord.findMany.mockResolvedValue([]);
    await run();
    const { where } = db.probationRecord.findMany.mock.calls[0][0];
    expect(where.status).toEqual({ in: ["PENDING", "EXTENDED"] });
    expect(where.dueDate.lt).toBeInstanceOf(Date);
    expect(where.employee).toEqual({ dateOfExit: null });
  });

  it("sends nothing when nothing is overdue", async () => {
    db.probationRecord.findMany.mockResolvedValue([]);
    expect(await (await run()).json()).toEqual({ overdue: 0, emailed: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the HR inbox once, not every HR admin", async () => {
    db.probationRecord.findMany.mockResolvedValue([
      { dueDate: new Date("2026-09-01"), status: "PENDING", employee: { name: "Asha", empId: "E1" } },
    ]);
    expect(await (await run()).json()).toEqual({ overdue: 1, emailed: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe(process.env.HR_EMAIL || "hr@madarth.com");
    expect(sendEmail.mock.calls[0][0].subject).toBe("1 probation confirmation overdue");
  });
});
