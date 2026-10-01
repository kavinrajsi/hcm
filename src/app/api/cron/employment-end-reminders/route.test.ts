import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendEndReminders = vi.hoisted(() => vi.fn());
vi.mock("@/lib/employment-emails", () => ({ sendEndReminders }));

const { GET } = await import("./route");
const request = (query = "", auth?: string) =>
  new NextRequest(`https://hcm.example.com/api/cron/employment-end-reminders${query}`, {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  sendEndReminders.mockResolvedValue({
    emailed: true,
    rows: [{ empId: "P1", name: "Asha", kind: "probation", endsOn: new Date("2026-10-05"), daysLeft: 4 }],
  });
});

describe("employment-end-reminders cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(sendEndReminders).not.toHaveBeenCalled();
  });

  it("runs and reports who was reminded", async () => {
    const response = await GET(request("", "Bearer cron-secret"));
    expect(await response.json()).toEqual({
      dryRun: false,
      emailed: true,
      due: [{ empId: "P1", name: "Asha", kind: "probation", endsOn: "2026-10-05", daysLeft: 4 }],
    });
    expect(sendEndReminders).toHaveBeenCalledWith({ dryRun: false });
  });

  it("passes dryRun through", async () => {
    await GET(request("?dryRun=1", "Bearer cron-secret"));
    expect(sendEndReminders).toHaveBeenCalledWith({ dryRun: true });
  });
});
