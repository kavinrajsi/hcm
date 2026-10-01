import { beforeEach, describe, expect, it, vi } from "vitest";

// Device server actions against a mocked database.

const db = vi.hoisted(() => ({
  device: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  deviceAssignment: { updateMany: vi.fn(), create: vi.fn() },
  deviceTicket: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  deviceTicketEvent: { create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
const requireUser = vi.hoisted(() => vi.fn());
const requireRole = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("@/lib/rbac", () => ({
  requireUser,
  requireRole,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message = "Not authorized") {
      super(message);
    }
  },
}));

const actions = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const HR = { id: "hr", role: "HR_ADMIN" };
const HOLDER = { id: "u-holder", role: "EMPLOYEE" };
const device = (overrides: Record<string, unknown> = {}) => ({
  id: "d1",
  status: "ASSIGNED",
  holderId: "e-holder",
  holder: { userId: "u-holder", manager: { userId: "u-boss" } },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(HR);
  requireRole.mockResolvedValue(HR);
  db.device.findUnique.mockResolvedValue(device());
});

describe("createDevice", () => {
  it("allocates the next asset tag, a token, and the first holder", async () => {
    db.device.findMany.mockResolvedValue([{ assetTag: "MAD-LAP-0004" }]);
    db.device.create.mockResolvedValue({ id: "new" });
    await expect(
      actions.createDevice({}, form({ type: "LAPTOP", brand: "Apple", model: "MacBook Air", employeeId: "e1" })),
    ).rejects.toMatchObject({ url: "/devices/new" });
    const data = db.device.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      assetTag: "MAD-LAP-0005",
      status: "ASSIGNED",
      holderId: "e1",
      assignments: { create: { employeeId: "e1", assignedById: "hr" } },
    });
    expect(data.publicToken).toMatch(/^[\w-]{16}$/);
  });

  it("rejects a bad price before touching the database", async () => {
    const state = await actions.createDevice(
      {},
      form({ type: "MOUSE", brand: "Logi", model: "M331", purchasePrice: "abc" }),
    );
    expect(state.error).toMatch(/Amounts/);
    expect(db.device.create).not.toHaveBeenCalled();
  });
});

describe("assignDevice", () => {
  it("closes the current holder's stint and opens a new one", async () => {
    const state = await actions.assignDevice({}, form({ deviceId: "d1", employeeId: "e-new" }));
    expect(state.ok).toBe("Assigned.");
    expect(db.deviceAssignment.updateMany).toHaveBeenCalledWith({
      where: { deviceId: "d1", returnedAt: null },
      data: expect.objectContaining({ returnedById: "hr" }),
    });
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { holderId: "e-new", status: "ASSIGNED" },
    });
  });

  it("is HR only", async () => {
    requireUser.mockResolvedValue(HOLDER);
    await expect(
      actions.assignDevice({}, form({ deviceId: "d1", employeeId: "e-new" })),
    ).rejects.toThrow("Not authorized");
  });

  it("won't hand out a device that's out for service", async () => {
    db.device.findUnique.mockResolvedValue(device({ status: "IN_SERVICE" }));
    const state = await actions.assignDevice({}, form({ deviceId: "d1", employeeId: "e-new" }));
    expect(state.error).toMatch(/in stock or assigned/);
  });
});

describe("issues and service", () => {
  it("lets the holder report an issue, logged as an OPEN event", async () => {
    requireUser.mockResolvedValue(HOLDER);
    const state = await actions.reportIssue(
      {},
      form({ deviceId: "d1", title: "Battery dies", description: "Lasts 40 minutes" }),
    );
    expect(state.ok).toBe("Issue reported.");
    expect(db.deviceTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportedById: "u-holder",
        events: { create: { toStatus: "OPEN", changedById: "u-holder" } },
      }),
    });
  });

  it("refuses someone who isn't the holder, their manager or HR", async () => {
    requireUser.mockResolvedValue({ id: "u-other", role: "MANAGER" });
    await expect(
      actions.reportIssue({}, form({ deviceId: "d1", title: "x x x", description: "y" })),
    ).rejects.toThrow("Not authorized");
  });

  it("sends an open issue for service and puts the device in service", async () => {
    requireUser.mockResolvedValue({ id: "u-boss", role: "MANAGER" });
    db.deviceTicket.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", deviceId: "d1" });
    const state = await actions.sendForService(
      {},
      form({ ticketId: "t1", serviceVendor: "Apple Care T Nagar", expectedBackOn: "2026-10-10" }),
    );
    expect(state.ok).toBe("Sent for service.");
    expect(db.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "IN_SERVICE" } });
    expect(db.deviceTicketEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: "OPEN", toStatus: "SENT_FOR_SERVICE" }),
    });
  });

  it("brings the device back to its holder when service is done", async () => {
    db.device.findUnique.mockResolvedValue(device({ status: "IN_SERVICE" }));
    db.deviceTicket.findUnique.mockResolvedValue({ id: "t1", status: "SENT_FOR_SERVICE", deviceId: "d1" });
    const state = await actions.resolveTicket({}, form({ ticketId: "t1", resolution: "Battery replaced", cost: "8500" }));
    expect(state.ok).toBe("Back from service.");
    expect(db.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "ASSIGNED" } });
    expect(db.deviceTicket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ status: "RESOLVED", cost: "8500" }),
    });
  });

  it("returns an unassigned device to stock after service", async () => {
    db.device.findUnique.mockResolvedValue(device({ status: "IN_SERVICE", holderId: null, holder: null }));
    db.deviceTicket.findUnique.mockResolvedValue({ id: "t1", status: "SENT_FOR_SERVICE", deviceId: "d1" });
    await actions.resolveTicket({}, form({ ticketId: "t1", resolution: "Fixed" }));
    expect(db.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "IN_STOCK" } });
  });
});
