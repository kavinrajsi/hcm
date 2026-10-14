import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  quantumHours: { findMany: vi.fn() },
  quantumTodo: { findMany: vi.fn() },
  employee: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { decimalHours, timesheet, timesheetCsv } = await import("./timesheet");

const entry = (id: string, todo: string, source: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id,
  todoBasecampId: todo,
  source,
  minutes,
  date: new Date("2026-10-13T00:00:00Z"),
  personId: source === "basecamp" ? "5" : null,
  personName: source === "basecamp" ? "Vasee" : null,
  note: null,
  employee: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.quantumTodo.findMany.mockResolvedValue([
    { basecampId: "t1", title: "Newsletter", appUrl: "https://bc/t1", projectId: "p1", projectName: "Madarth Branding" },
    { basecampId: "t2", title: "KM Carousel 7", appUrl: "https://bc/t2", projectId: "p2", projectName: "NAC Jewellers" },
  ]);
  db.employee.findMany.mockResolvedValue([{ basecampPersonId: "5", name: "Vasee R", avatarBlobKey: "a.jpg" }]);
});

describe("timesheet", () => {
  it("groups entries by project, busiest first, with totals", async () => {
    db.quantumHours.findMany.mockResolvedValue([
      entry("h1", "t1", "basecamp", 120, { note: "flow" }),
      entry("h2", "t2", "basecamp", 6),
      entry("h3", "t1", "basecamp", 18),
    ]);
    const { projects, totalMinutes } = await timesheet({ todoWhere: {}, people: [] });
    expect(projects.map((project) => [project.projectName, project.totalMinutes])).toEqual([
      ["Madarth Branding", 138],
      ["NAC Jewellers", 6],
    ]);
    expect(totalMinutes).toBe(144);
    expect(projects[0].entries[0]).toMatchObject({ personName: "Vasee R", avatarKey: "a.jpg", todoTitle: "Newsletter", note: "flow" });
  });

  it("doesn't double count HCM hours on a to-do that has Basecamp hours", async () => {
    db.quantumHours.findMany.mockResolvedValue([
      entry("h1", "t1", "basecamp", 60),
      entry("h2", "t1", "hcm", 60, { employee: { id: "e1", name: "Ravi", basecampPersonId: "7", avatarBlobKey: null } }),
      entry("h3", "t2", "hcm", 30, { employee: { id: "e1", name: "Ravi", basecampPersonId: "7", avatarBlobKey: null } }),
    ]);
    const { totalMinutes, projects } = await timesheet({ todoWhere: {}, people: [] });
    expect(totalMinutes).toBe(90);
    expect(projects.find((project) => project.projectId === "p2")!.entries[0]).toMatchObject({ personName: "Ravi", source: "hcm" });
  });

  it("filters by who logged the hours, and to one's own for employees", async () => {
    db.quantumHours.findMany.mockResolvedValue([
      entry("h1", "t1", "basecamp", 60),
      entry("h2", "t2", "basecamp", 30, { personId: "9", personName: "Other" }),
    ]);
    expect((await timesheet({ todoWhere: {}, people: ["9"] })).totalMinutes).toBe(30);
    expect((await timesheet({ todoWhere: {}, people: [], onlyPersonId: "5", onlyEmployeeId: null })).totalMinutes).toBe(60);
  });
});

describe("decimalHours / CSV", () => {
  it("writes hours like Basecamp and quotes CSV cells", () => {
    expect(decimalHours(18)).toBe("0.3");
    expect(decimalHours(60)).toBe("1");
    expect(decimalHours(372)).toBe("6.2");
    const csv = timesheetCsv(
      [
        {
          projectId: "p1",
          projectName: "Madarth® Branding",
          totalMinutes: 60,
          entries: [
            {
              id: "h1",
              date: new Date("2026-10-13T00:00:00Z"),
              minutes: 60,
              personId: "5",
              personName: "Vasee",
              avatarKey: null,
              todoTitle: 'Case study, "NEW"',
              todoUrl: "https://bc/t1",
              note: "line one\nline two",
              source: "basecamp",
            },
          ],
        },
      ],
      () => "13/10/2026",
    );
    expect(csv.split("\r\n")[0]).toBe("Date,Project,Hours,Person,To-do,Note,Link");
    expect(csv).toContain('13/10/2026,Madarth® Branding,1,Vasee,"Case study, ""NEW""","line one\nline two",https://bc/t1');
  });
});
