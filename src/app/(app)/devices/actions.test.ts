import { beforeEach, describe, expect, it, vi } from "vitest";

// Device server actions against a mocked database.

const db = vi.hoisted(() => ({
  device: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  deviceAssignment: { updateMany: vi.fn(), create: vi.fn() },
  deviceTicket: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  deviceTicketEvent: { create: vi.fn() },
  vendor: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
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
  type: "LAPTOP",
  assetTag: "MAD-LAP-PBCH0007",
  stockTag: "MAD-LAP-0001",
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
  db.device.findMany.mockResolvedValue([]);
  db.employee.findUnique.mockResolvedValue({ empId: "PBCH0100" });
});

describe("createDevice", () => {
  it("allocates the next asset tag, a token, and the first holder", async () => {
    db.device.findMany
      .mockResolvedValueOnce([
        { assetTag: "MAD-LAP-0004", stockTag: "MAD-LAP-0004" },
        { assetTag: "MAD-LAP-PBCH0009", stockTag: "MAD-LAP-0005" },
      ])
      .mockResolvedValueOnce([]);
    db.device.create.mockResolvedValue({ id: "new" });
    await expect(
      actions.createDevice({}, form({ type: "LAPTOP", brand: "Apple", model: "MacBook Air", employeeId: "e1" })),
    ).rejects.toMatchObject({ url: "/devices/new" });
    const data = db.device.create.mock.calls[0][0].data;
    // Next number counts assigned devices' stock tags too; held → holder's tag.
    expect(data).toMatchObject({
      stockTag: "MAD-LAP-0006",
      assetTag: "MAD-LAP-PBCH0100",
      status: "ASSIGNED",
      holderId: "e1",
      assignments: { create: { employeeId: "e1", assignedById: "hr" } },
    });
    expect(data.publicToken).toMatch(/^[\w-]{16}$/);
  });

  it("saves a rented device with its rent and the vendor's reference", async () => {
    db.vendor.findUnique.mockResolvedValue({ kind: "BOTH", active: true });
    db.device.findMany.mockResolvedValue([]);
    db.device.create.mockResolvedValue({ id: "r1" });
    await expect(
      actions.createDevice(
        {},
        form({
          type: "LAPTOP",
          brand: "HP",
          model: "Elitebook 840 G5",
          ownership: "RENTED",
          monthlyRent: "2400.00",
          vendorRef: "Laptop2",
          vendorId: "v-win",
        }),
      ),
    ).rejects.toMatchObject({ url: "/devices/r1" });
    expect(db.device.create.mock.calls[0][0].data).toMatchObject({
      ownership: "RENTED",
      monthlyRent: "2400.00",
      vendorRef: "Laptop2",
      vendorId: "v-win",
    });
  });

  it("needs a vendor and a rent for a rented device", async () => {
    let state = await actions.createDevice(
      {},
      form({ type: "LAPTOP", brand: "HP", model: "840", ownership: "RENTED", monthlyRent: "2400" }),
    );
    expect(state.fieldErrors?.vendorId?.[0]).toMatch(/vendor it's rented from/);
    state = await actions.createDevice(
      {},
      form({ type: "LAPTOP", brand: "HP", model: "840", ownership: "RENTED", vendorId: "v-win" }),
    );
    expect(state.fieldErrors?.monthlyRent?.[0]).toMatch(/monthly rent/);
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("drops rent from an owned device", async () => {
    db.device.findMany.mockResolvedValue([]);
    db.device.create.mockResolvedValue({ id: "o1" });
    await expect(
      actions.createDevice({}, form({ type: "MOUSE", brand: "Logi", model: "M331", monthlyRent: "100" })),
    ).rejects.toMatchObject({ url: "/devices/o1" });
    expect(db.device.create.mock.calls[0][0].data).toMatchObject({ ownership: "OWNED", monthlyRent: null });
  });

  it("rejects a vendor that doesn't sell devices", async () => {
    db.vendor.findUnique.mockResolvedValue({ kind: "SERVICE", active: true });
    const state = await actions.createDevice(
      {},
      form({ type: "MOUSE", brand: "Logi", model: "M331", vendorId: "v-svc" }),
    );
    expect(state.fieldErrors?.vendorId?.[0]).toMatch(/sells devices/);
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it("rejects a bad price before touching the database", async () => {
    const state = await actions.createDevice(
      {},
      form({ type: "MOUSE", brand: "Logi", model: "M331", purchasePrice: "abc" }),
    );
    expect(state.fieldErrors?.purchasePrice?.[0]).toMatch(/Amounts/);
    expect(db.device.create).not.toHaveBeenCalled();
  });
});

describe("assignDevice", () => {
  it("closes the current holder's stint and opens a new one", async () => {
    const state = await actions.assignDevice({}, form({ deviceId: "d1", employeeId: "e-new" }));
    expect(state.ok).toMatch(/^Assigned/);
    expect(db.deviceAssignment.updateMany).toHaveBeenCalledWith({
      where: { deviceId: "d1", returnedAt: null },
      data: expect.objectContaining({ returnedById: "hr" }),
    });
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { holderId: "e-new", status: "ASSIGNED", assetTag: "MAD-LAP-PBCH0100", stockTag: "MAD-LAP-0001" },
    });
    expect(state.ok).toContain("MAD-LAP-PBCH0100");
  });

  it("numbers the tag when the new holder already has a laptop", async () => {
    db.device.findMany.mockResolvedValue([{ assetTag: "MAD-LAP-PBCH0100" }]);
    await actions.assignDevice({}, form({ deviceId: "d1", employeeId: "e-new" }));
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: expect.objectContaining({ assetTag: "MAD-LAP-PBCH0100-2" }),
    });
  });

  it("goes back to its numbered tag when returned", async () => {
    const state = await actions.returnDevice({}, form({ deviceId: "d1" }));
    expect(db.device.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { holderId: null, status: "IN_STOCK", assetTag: "MAD-LAP-0001", stockTag: "MAD-LAP-0001" },
    });
    expect(state.ok).toContain("MAD-LAP-0001");
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
    db.vendor.findUnique.mockResolvedValue({ name: "Apple Care T Nagar", kind: "SERVICE", active: true });
    db.deviceTicket.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", deviceId: "d1" });
    const state = await actions.sendForService(
      {},
      form({ ticketId: "t1", serviceVendorId: "v-svc", expectedBackOn: "2026-10-10" }),
    );
    expect(state.ok).toBe("Sent for service.");
    expect(db.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "IN_SERVICE" } });
    expect(db.deviceTicketEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: "OPEN",
        toStatus: "SENT_FOR_SERVICE",
        note: "Sent to Apple Care T Nagar",
      }),
    });
    expect(db.deviceTicket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ serviceVendorId: "v-svc" }),
    });
  });

  it("won't send to a vendor that only sells, or is inactive", async () => {
    db.deviceTicket.findUnique.mockResolvedValue({ id: "t1", status: "OPEN", deviceId: "d1" });
    db.vendor.findUnique.mockResolvedValue({ name: "Croma", kind: "SALES", active: true });
    let state = await actions.sendForService({}, form({ ticketId: "t1", serviceVendorId: "v-shop" }));
    expect(state.fieldErrors?.serviceVendorId?.[0]).toMatch(/services devices/);
    db.vendor.findUnique.mockResolvedValue({ name: "Old shop", kind: "SERVICE", active: false });
    state = await actions.sendForService({}, form({ ticketId: "t1", serviceVendorId: "v-old" }));
    expect(state.fieldErrors?.serviceVendorId?.[0]).toMatch(/services devices/);
    expect(db.device.update).not.toHaveBeenCalled();
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
