import { beforeEach, describe, expect, it, vi } from "vitest";

// Vendor emails only go out after the sender confirms them in the UI.

const db = vi.hoisted(() => ({
  vendor: { findUnique: vi.fn() },
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  devicePurchaseRequest: {
    createMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })) }));

const {
  previewPurchaseRequest,
  retryPurchaseRequest,
  saveLaptopOsMap,
  savePurchaseEmailSettings,
  sendPurchaseRequest,
} = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const order = {
  requestKey: "0b7f6c1e-1111-4222-8333-944455556666",
  vendorId: "v1",
  recipient: "c1",
  type: "LAPTOP",
  os: "MAC",
  itemName: "MacBook Air",
  quantity: "1",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.vendor.findUnique.mockResolvedValue({
    name: "Shop",
    email: "info@shop.test",
    kind: "SALES",
    active: true,
    contacts: [{ id: "c1", name: "Ravi", role: "Sales", email: "ravi@shop.test", isPrimary: true, position: 0 }],
  });
  db.appSetting.findUnique.mockResolvedValue(null);
  db.devicePurchaseRequest.createMany.mockResolvedValue({ count: 1 });
  db.devicePurchaseRequest.findUniqueOrThrow.mockResolvedValue({
    id: order.requestKey,
    type: "LAPTOP",
    os: "MAC",
    itemName: "MacBook Air",
    quantity: 1,
    neededBy: null,
    notes: null,
    emailTo: "ravi@shop.test",
    emailCc: ["admin@madarth.com"],
    emailReplyTo: "admin@madarth.com",
    emailSubject: "Device request",
    contactName: "Ravi",
    vendor: { name: "Shop" },
  });
  sendEmail.mockResolvedValue({ skipped: false, id: "z1" });
});

describe("sendPurchaseRequest", () => {
  it("refuses to send without the sender's confirmation", async () => {
    const state = await sendPurchaseRequest(form(order));
    expect(state.error).toMatch(/Confirm the email/);
    expect(db.devicePurchaseRequest.createMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends once confirmed, to the chosen contact, greeting them by name", async () => {
    const state = await sendPurchaseRequest(form({ ...order, confirmed: "yes" }));
    expect(state.ok).toBe("Sent to ravi@shop.test.");
    expect(db.devicePurchaseRequest.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ emailTo: "ravi@shop.test", contactName: "Ravi", os: "MAC" })],
      skipDuplicates: true,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Madarth <noreply@madarth.com>",
        to: "ravi@shop.test",
        cc: ["admin@madarth.com"],
        replyTo: "admin@madarth.com",
        html: expect.stringContaining("Hi Ravi,"),
      }),
    );
  });

  it("puts order problems under the field they're about", async () => {
    const state = await sendPurchaseRequest(form({ ...order, confirmed: "yes", itemName: "", quantity: "0" }));
    expect(state.fieldErrors?.itemName?.[0]).toMatch(/Say which device/);
    expect(state.fieldErrors?.quantity?.[0]).toMatch(/at least 1/);
    expect(db.devicePurchaseRequest.createMany).not.toHaveBeenCalled();
  });

  it("doesn't send twice for the same request key", async () => {
    db.devicePurchaseRequest.createMany.mockResolvedValue({ count: 0 });
    const state = await sendPurchaseRequest(form({ ...order, confirmed: "yes" }));
    expect(state.error).toMatch(/already sent/);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("retryPurchaseRequest", () => {
  it("also needs confirmation", async () => {
    const state = await retryPurchaseRequest(form({ id: "r1" }));
    expect(state.error).toMatch(/Confirm the email/);
    expect(db.devicePurchaseRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("previewPurchaseRequest", () => {
  it("flags a vendor that can't be ordered from on the vendor field", async () => {
    db.vendor.findUnique.mockResolvedValue(null);
    const state = await previewPurchaseRequest(form(order));
    expect(state.fieldErrors?.vendorId?.[0]).toMatch(/active vendor/);
    expect(state.preview).toBeUndefined();
  });
});

describe("savePurchaseEmailSettings", () => {
  it("puts a bad address under reply-to or CC", async () => {
    const replyTo = await savePurchaseEmailSettings({}, form({ replyTo: "a@x.com b@x.com", cc: "" }));
    expect(replyTo.fieldErrors?.replyTo).toEqual(["Enter exactly one address."]);
    const cc = await savePurchaseEmailSettings({}, form({ replyTo: "a@x.com", cc: "nope" }));
    expect(cc.fieldErrors?.cc?.[0]).toMatch(/isn't a valid email/);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("saveLaptopOsMap", () => {
  it("asks for the OS when a new designation is typed without one", async () => {
    const state = await saveLaptopOsMap({}, form({ newDesignation: "Designer", newOs: "" }));
    expect(state.fieldErrors?.newOs?.[0]).toMatch(/Pick the laptop OS/);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});
