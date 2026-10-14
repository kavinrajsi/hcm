import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  dashboard: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  dashboardWidget: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  dashboardShare: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  dashboardCatalogWidget: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  user: { findMany: vi.fn() },
  employee: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const auth = vi.hoisted(() => ({ user: { id: "u1", role: "EMPLOYEE" as string, email: "a@b.c" } }));
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => auth.user),
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(auth.user.role)) throw new Error("Not authorized");
    return auth.user;
  }),
}));

const actions = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "u1", role: "EMPLOYEE", email: "a@b.c" };
  db.$transaction.mockResolvedValue([]);
  db.dashboardWidget.aggregate.mockResolvedValue({ _max: { position: 2 } });
  db.dashboardWidget.create.mockResolvedValue({ id: "w-new" });
});

const ownDashboard = { id: "d1", ownerId: "u1", role: null };

describe("addWidget", () => {
  it("refuses someone else's dashboard", async () => {
    db.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: "u9", role: null });
    expect(await actions.addWidget("d1", { catalogId: "upcoming-sessions" })).toEqual({ ok: false, error: "You can't change this dashboard." });
    expect(db.dashboardWidget.create).not.toHaveBeenCalled();
  });

  it("refuses catalogue widgets the role can't use", async () => {
    db.dashboard.findUnique.mockResolvedValue(ownDashboard);
    expect(await actions.addWidget("d1", { catalogId: "recruitment-pipeline" })).toMatchObject({ ok: false });
    expect(await actions.addWidget("d1", { title: "Hires", spec: { source: "candidates" } })).toMatchObject({ ok: false });
    expect(db.dashboardWidget.create).not.toHaveBeenCalled();
  });

  it("adds an allowed widget at the end", async () => {
    db.dashboard.findUnique.mockResolvedValue(ownDashboard);
    expect(await actions.addWidget("d1", { title: "My leave", spec: { source: "leave", chart: "number" } })).toEqual({ ok: true, id: "w-new" });
    expect(db.dashboardWidget.create.mock.calls[0][0].data).toMatchObject({ dashboardId: "d1", title: "My leave", width: 1, height: 1, position: 3 });
  });

  it("HR adding to a role default checks that role, not HR", async () => {
    auth.user = { id: "hr", role: "HR_ADMIN", email: "h@b.c" };
    db.dashboard.findUnique.mockResolvedValue({ id: "d2", ownerId: null, role: "EMPLOYEE" });
    expect(await actions.addWidget("d2", { catalogId: "active-employees" })).toMatchObject({ ok: false });
    expect(await actions.addWidget("d2", { catalogId: "upcoming-sessions" })).toMatchObject({ ok: true });
  });
});

describe("sharing", () => {
  it("only the owner shares, never with themselves or disabled users", async () => {
    db.dashboard.findUnique.mockResolvedValue({ id: "d2", ownerId: null, role: "MANAGER" });
    auth.user = { id: "hr", role: "HR_ADMIN", email: "h@b.c" };
    expect(await actions.setShares("d2", ["u5"])).toMatchObject({ ok: false });

    db.dashboard.findUnique.mockResolvedValue(ownDashboard);
    auth.user = { id: "u1", role: "EMPLOYEE", email: "a@b.c" };
    db.user.findMany.mockResolvedValue([{ id: "u5" }]);
    expect(await actions.setShares("d1", ["u5", "u1", "u6"])).toMatchObject({ ok: true });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["u5", "u6"] }, disabledAt: null });
    expect(db.dashboardShare.createMany).toHaveBeenCalledWith({ data: [{ dashboardId: "d1", userId: "u5" }], skipDuplicates: true });
  });
});

describe("catalogue", () => {
  it("only HR can publish", async () => {
    await expect(actions.publishWidget("w1", "")).rejects.toThrow("Not authorized");
    expect(db.dashboardCatalogWidget.create).not.toHaveBeenCalled();
  });

  it("HR publishes custom widgets only", async () => {
    auth.user = { id: "hr", role: "HR_ADMIN", email: "h@b.c" };
    db.dashboardWidget.findUnique.mockResolvedValue({ id: "w1", title: "Built-in", spec: null, width: 2, height: 2 });
    expect(await actions.publishWidget("w1", "")).toMatchObject({ ok: false });
    db.dashboardWidget.findUnique.mockResolvedValue({ id: "w1", title: "Hours", spec: { source: "quantumHours" }, width: 2, height: 2 });
    db.dashboardCatalogWidget.create.mockResolvedValue({ id: "c1" });
    expect(await actions.publishWidget("w1", " Team hours ")).toEqual({ ok: true, id: "c1" });
    expect(db.dashboardCatalogWidget.create.mock.calls[0][0].data).toMatchObject({ title: "Hours", description: "Team hours", createdById: "hr" });
  });
});

describe("widgets", () => {
  it("can't edit or resize widgets on a dashboard shared with you", async () => {
    db.dashboardWidget.findUnique.mockResolvedValue({ id: "w1", dashboardId: "d9", builtinKey: null });
    db.dashboard.findUnique.mockResolvedValue({ id: "d9", ownerId: "someone", role: null });
    expect(await actions.resizeWidget("w1", "wide")).toMatchObject({ ok: false });
    expect(await actions.updateWidget("w1", { title: "x", spec: { source: "leave" } })).toMatchObject({ ok: false });
    expect(await actions.removeWidget("w1")).toMatchObject({ ok: false });
    expect(db.dashboardWidget.update).not.toHaveBeenCalled();
    expect(db.dashboardWidget.delete).not.toHaveBeenCalled();
  });

  it("field options follow the source's role rule", async () => {
    expect(await actions.fieldOptions("candidates", "role")).toEqual([]);
    expect(await actions.fieldOptions("leave", "status")).toEqual([
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
    ]);
  });
});
