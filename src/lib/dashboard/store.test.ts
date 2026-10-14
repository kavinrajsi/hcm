import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  dashboard: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const { builtInDashboards, dashboardsFor, editableDashboard, materialize } = await import("./store");

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Dash ${id}`, widgets: [], ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((work: (tx: typeof db) => unknown) => work(db));
});

describe("built-in layout", () => {
  it("is today's dashboard for HR", () => {
    const [dashboard] = builtInDashboards("HR_ADMIN");
    expect(dashboard.name).toBe("Overview");
    expect(dashboard.widgets.map((widget) => widget.title)).toEqual([
      "Active employees",
      "Joiners this month",
      "Exits this month",
      "Probation due",
      "ID cards pending",
      "Upcoming sessions",
      "Freelancers",
      "Job postings by role",
      "Recruitment pipeline",
      "Applications by role and month",
    ]);
  });

  it("drops what a role can't see", () => {
    expect(builtInDashboards("EMPLOYEE")[0].widgets.map((widget) => widget.title)).toEqual(["Upcoming sessions"]);
    const manager = builtInDashboards("MANAGER")[0].widgets.map((widget) => widget.title);
    expect(manager).not.toContain("ID cards pending");
    expect(manager).not.toContain("Recruitment pipeline");
    expect(manager).toContain("Probation due");
  });
});

describe("dashboardsFor", () => {
  const scope = { kind: "user" as const, userId: "u1", role: "MANAGER" as const };

  it("prefers the person's own", async () => {
    db.dashboard.findMany.mockResolvedValueOnce([row("mine")]);
    expect(await dashboardsFor(scope)).toMatchObject({ origin: "own", dashboards: [{ id: "mine" }] });
  });

  it("falls back to the role default, then the built-in layout", async () => {
    db.dashboard.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row("managers")]);
    expect(await dashboardsFor(scope)).toMatchObject({ origin: "role-default", dashboards: [{ id: "managers" }] });
    expect(db.dashboard.findMany.mock.calls[1][0].where).toEqual({ role: "MANAGER", ownerId: null });

    db.dashboard.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await dashboardsFor(scope)).toMatchObject({ origin: "built-in", dashboards: [{ id: "built-in" }] });
  });
});

describe("materialize", () => {
  it("copies what the person sees into their own rows", async () => {
    db.dashboard.findMany
      .mockResolvedValueOnce([]) // own
      .mockResolvedValueOnce([]) // role default
      .mockResolvedValueOnce([row("copied")]); // after the copy
    db.dashboard.count.mockResolvedValue(0);
    const result = await materialize({ kind: "user", userId: "u1", role: "EMPLOYEE" });
    expect(db.dashboard.create).toHaveBeenCalledTimes(1);
    const data = db.dashboard.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ ownerId: "u1", name: "Overview", position: 0 });
    expect(data.widgets.create).toEqual([expect.objectContaining({ title: "Upcoming sessions", width: 1, height: 1, position: 0 })]);
    expect(result).toMatchObject([{ id: "copied" }]);
  });

  it("does nothing when the rows exist", async () => {
    db.dashboard.findMany.mockResolvedValueOnce([row("mine")]);
    await materialize({ kind: "user", userId: "u1", role: "EMPLOYEE" });
    expect(db.dashboard.create).not.toHaveBeenCalled();
  });
});

describe("editableDashboard", () => {
  it("allows the owner, and HR on role defaults only", async () => {
    db.dashboard.findUnique.mockResolvedValue({ id: "d", ownerId: "u1", role: null });
    expect(await editableDashboard({ id: "u1", role: "EMPLOYEE" }, "d")).not.toBeNull();
    expect(await editableDashboard({ id: "u2", role: "HR_ADMIN" }, "d")).toBeNull();

    db.dashboard.findUnique.mockResolvedValue({ id: "d", ownerId: null, role: "MANAGER" });
    expect(await editableDashboard({ id: "u2", role: "HR_ADMIN" }, "d")).not.toBeNull();
    expect(await editableDashboard({ id: "u3", role: "MANAGER" }, "d")).toBeNull();
  });
});
