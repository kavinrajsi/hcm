import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) });
  return {
    employee: model(),
    leaveEntry: model(),
    candidate: model(),
    quantumHours: model(),
    quantumTodo: model(),
    trainingSession: model(),
    device: model(),
    probationRecord: model(),
    idCard: model(),
    freelancer: model(),
  };
});
vi.mock("@/lib/db", () => ({ db }));

const { runWidget, effectiveRange, cleanSpec } = await import("./run");
const { SOURCES } = await import("./sources");
const { widgetSpecSchema } = await import("./spec");

const hr = { id: "u-hr", role: "HR_ADMIN" as const, employeeId: "e-hr", basecampPersonId: "p-hr" };
const manager = { id: "u-m", role: "MANAGER" as const, employeeId: "e-m", basecampPersonId: "p-m" };
const employee = { id: "u-e", role: "EMPLOYEE" as const, employeeId: "e-e", basecampPersonId: "p-e" };
const now = new Date("2026-10-14T06:30:00Z");

const whereOf = (mock: { mock: { calls: unknown[][] } }) => (mock.mock.calls.at(-1)![0] as { where: unknown }).where;

beforeEach(() => {
  for (const model of Object.values(db)) {
    model.findMany.mockReset().mockResolvedValue([]);
    model.count.mockReset().mockResolvedValue(0);
  }
});

describe("access", () => {
  it("refuses sources the viewer's role can't use", async () => {
    for (const source of ["employees", "candidates", "devices", "probation", "idCards", "freelancers"]) {
      const result = await runWidget({ source }, employee, { now });
      expect(result).toEqual({ kind: "message", message: "Not available for your role." });
    }
    expect(await runWidget({ source: "candidates" }, manager, { now })).toMatchObject({ kind: "message" });
    expect(db.candidate.count).not.toHaveBeenCalled();
  });

  it("re-checks saved specs", async () => {
    expect(await runWidget({ source: "nope" }, hr, { now })).toMatchObject({ kind: "message" });
    expect(await runWidget("garbage", hr, { now })).toMatchObject({ kind: "message" });
  });

  it("managers count only their direct reports", async () => {
    db.employee.count.mockResolvedValue(4);
    const result = await runWidget({ source: "employees" }, manager, { now });
    expect(result).toMatchObject({ kind: "number", value: 4, display: "4" });
    expect(JSON.stringify(whereOf(db.employee.count))).toContain('"manager":{"userId":"u-m"}');
  });

  it("HR counts everyone", async () => {
    await runWidget({ source: "employees" }, hr, { now });
    expect(JSON.stringify(whereOf(db.employee.count))).not.toContain("userId");
  });

  it("employees see only their own leave", async () => {
    await runWidget({ source: "leave" }, employee, { now });
    expect(JSON.stringify(whereOf(db.leaveEntry.count))).toContain('"employeeId":"e-e"');
  });

  it("managers see their team's leave", async () => {
    await runWidget({ source: "leave" }, manager, { now });
    expect(JSON.stringify(whereOf(db.leaveEntry.count))).toContain('"employee":{"manager":{"userId":"u-m"}}');
  });

  it("employees see only to-dos assigned to them", async () => {
    await runWidget({ source: "quantumTodos" }, employee, { now });
    expect(JSON.stringify(whereOf(db.quantumTodo.count))).toContain('"assigneeIds":{"has":"p-e"}');
    await runWidget({ source: "quantumTodos" }, manager, { now });
    expect(JSON.stringify(whereOf(db.quantumTodo.count))).not.toContain('"has"');
  });

  it("employees see only hours they logged", async () => {
    await runWidget({ source: "quantumHours" }, employee, { now });
    // First query: the viewer's entries (the second only lists to-dos with Basecamp hours).
    const where = JSON.stringify((db.quantumHours.findMany.mock.calls[0][0] as { where: unknown }).where);
    expect(where).toContain('"personId":"p-e"');
    expect(where).toContain('"employeeId":"e-e"');
  });

  it("managers see their reports' devices and probation only", async () => {
    await runWidget({ source: "devices" }, manager, { now });
    expect(JSON.stringify(whereOf(db.device.count))).toContain('"holder":{"manager":{"userId":"u-m"}}');
    await runWidget({ source: "probation" }, manager, { now });
    expect(JSON.stringify(whereOf(db.probationRecord.count))).toContain('"manager":{"userId":"u-m"}');
  });

  it("candidates never include spam or local test applications", async () => {
    await runWidget({ source: "candidates" }, hr, { now });
    const where = JSON.stringify(whereOf(db.candidate.count));
    expect(where).toContain("honeypot");
    expect(where).toContain("localhost");
  });
});

describe("spec cleaning", () => {
  it("drops unknown filters and values that aren't allowed", async () => {
    await runWidget({ source: "employees", filters: { empType: ["INTERN", "HACK"], secret: ["x"] } }, hr, { now });
    const where = JSON.stringify(whereOf(db.employee.count));
    expect(where).toContain('"empType":{"in":["INTERN"]}');
    expect(where).not.toContain("HACK");
    expect(where).not.toContain("secret");
  });

  it("number widgets ignore grouping; unknown groupings are dropped", () => {
    const source = SOURCES.employees;
    expect(cleanSpec(source, widgetSpecSchema.parse({ source: "employees", groupBy: "department" })).groupBy).toBeUndefined();
    expect(cleanSpec(source, widgetSpecSchema.parse({ source: "employees", chart: "bar", groupBy: "salary" })).groupBy).toBeUndefined();
    expect(cleanSpec(source, widgetSpecSchema.parse({ source: "employees", chart: "bar", groupBy: "time:month" })).groupBy).toBe("time:month");
  });
});

describe("dashboard date picker", () => {
  it("overrides period widgets but not totals or upcoming lists", () => {
    expect(effectiveRange({ preset: "last-3-months" }, "this-month")).toEqual({ preset: "this-month" });
    expect(effectiveRange({ preset: "all" }, "this-month")).toEqual({ preset: "all" });
    expect(effectiveRange({ preset: "upcoming" }, "this-month")).toEqual({ preset: "upcoming" });
    expect(effectiveRange({ preset: "this-month" }, null)).toEqual({ preset: "this-month" });
  });
});

describe("results", () => {
  it("groups with labels and click-through links", async () => {
    db.leaveEntry.findMany.mockResolvedValue([
      { startDate: new Date("2026-10-05T00:00:00Z"), postedOn: new Date("2026-10-04T00:00:00Z"), days: 1, type: "FULL_DAY", status: "APPROVED", checkin: "leave", employeeId: "e1", employee: { department: "Design" } },
      { startDate: new Date("2026-10-06T00:00:00Z"), postedOn: new Date("2026-10-06T00:00:00Z"), days: 0.5, type: "HALF_DAY", status: "APPROVED", checkin: "leave", employeeId: "e1", employee: { department: "Design" } },
      { startDate: new Date("2026-10-07T00:00:00Z"), postedOn: new Date("2026-10-07T00:00:00Z"), days: 1, type: "FULL_DAY", status: "PENDING", checkin: "leave", employeeId: "e2", employee: { department: "Tech" } },
    ]);
    const result = await runWidget(
      { source: "leave", chart: "bar", groupBy: "type", measure: "days", range: { preset: "this-month" } },
      manager,
      { now },
    );
    expect(result).toMatchObject({
      kind: "groups",
      total: "2.5 days",
      groups: [
        { key: "FULL_DAY", label: "Full day", display: "2 days", href: "/leave?type=FULL_DAY" },
        { key: "HALF_DAY", display: "0.5 days" },
      ],
    });
  });

  it("employees' leave links go to their own leave page", async () => {
    const result = await runWidget({ source: "leave", filters: { status: ["PENDING"] } }, employee, { now });
    expect(result).toMatchObject({ kind: "number", href: "/profile/leave?status=PENDING" });
  });

  it("compares with the period before", async () => {
    db.employee.count.mockResolvedValueOnce(6).mockResolvedValueOnce(4);
    const result = await runWidget(
      { source: "employees", dateField: "joined", range: { preset: "this-month" }, compare: true },
      hr,
      { now },
    );
    expect(result).toMatchObject({ kind: "number", value: 6, change: "+50%", previousDisplay: "4", href: "/employees?joined=month" });
  });
});
