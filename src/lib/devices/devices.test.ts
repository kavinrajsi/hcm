import { describe, expect, it } from "vitest";
import {
  canAssign,
  canMoveTicket,
  deviceScanUrl,
  newPublicToken,
  nextAssetTag,
  statusAfterService,
} from "./devices";
import { deviceAccess } from "./access";

describe("nextAssetTag", () => {
  it("starts at 0001 and follows the highest of the same type", () => {
    expect(nextAssetTag("LAPTOP", [])).toBe("MAD-LAP-0001");
    expect(
      nextAssetTag("LAPTOP", ["MAD-LAP-0002", "MAD-LAP-0010", "MAD-MOU-0099"]),
    ).toBe("MAD-LAP-0011");
    expect(nextAssetTag("USB_HUB", ["MAD-LAP-0003"])).toBe("MAD-HUB-0001");
  });
});

describe("newPublicToken", () => {
  it("is URL-safe and different each time", () => {
    const token = newPublicToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(newPublicToken()).not.toBe(token);
  });
});

describe("status rules", () => {
  it("returns from service to the holder, or to stock", () => {
    expect(statusAfterService("e1")).toBe("ASSIGNED");
    expect(statusAfterService(null)).toBe("IN_STOCK");
  });

  it("only hands out devices that are in stock or assigned", () => {
    expect(canAssign("IN_STOCK")).toBe(true);
    expect(canAssign("ASSIGNED")).toBe(true);
    expect(canAssign("IN_SERVICE")).toBe(false);
    expect(canAssign("RETIRED")).toBe(false);
  });

  it("allows ticket moves only forward", () => {
    expect(canMoveTicket("OPEN", "SENT_FOR_SERVICE")).toBe(true);
    expect(canMoveTicket("SENT_FOR_SERVICE", "RESOLVED")).toBe(true);
    expect(canMoveTicket("SENT_FOR_SERVICE", "CANCELLED")).toBe(false);
    expect(canMoveTicket("RESOLVED", "OPEN")).toBe(false);
  });
});

describe("deviceScanUrl", () => {
  it("uses AUTH_URL when set", () => {
    process.env.AUTH_URL = "https://hcm.example.com/";
    expect(deviceScanUrl("abc")).toBe("https://hcm.example.com/d/abc");
    delete process.env.AUTH_URL;
    expect(deviceScanUrl("abc", "http://localhost:3000")).toBe(
      "http://localhost:3000/d/abc",
    );
  });
});

describe("deviceAccess", () => {
  const device = {
    holder: { userId: "u-holder", manager: { userId: "u-boss" } },
  };
  it("lets HR manage any device", () => {
    expect(deviceAccess({ id: "hr", role: "HR_ADMIN" }, { holder: null })).toBe("manage");
  });
  it("lets the holder and the holder's manager act", () => {
    expect(deviceAccess({ id: "u-holder", role: "EMPLOYEE" }, device)).toBe("act");
    expect(deviceAccess({ id: "u-boss", role: "MANAGER" }, device)).toBe("act");
  });
  it("gives nobody else access", () => {
    expect(deviceAccess({ id: "u-other", role: "MANAGER" }, device)).toBeNull();
    expect(deviceAccess({ id: "u-other", role: "EMPLOYEE" }, device)).toBeNull();
    expect(deviceAccess({ id: "u-boss", role: "MANAGER" }, { holder: null })).toBeNull();
  });
});
