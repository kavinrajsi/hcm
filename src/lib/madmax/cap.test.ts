import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { capBlock, readCap } = await import("./cap");

describe("readCap", () => {
  it("reads rupee caps and treats bad values as no cap", () => {
    expect(readCap({ perUserInr: 100, totalInr: 2000 })).toEqual({ perUserInr: 100, totalInr: 2000 });
    expect(readCap({ perUserInr: -1, totalInr: "x" })).toEqual({ perUserInr: null, totalInr: null });
    expect(readCap(null)).toEqual({ perUserInr: null, totalInr: null });
  });
});

describe("capBlock", () => {
  const cap = { perUserInr: 100, totalInr: 2000 };

  it("allows spend under both caps", () => {
    expect(capBlock(cap, { user: 99.9, total: 1999 })).toBeNull();
  });

  it("stops a person at their cap", () => {
    expect(capBlock(cap, { user: 100, total: 500 })).toMatch(/your ₹100/);
  });

  it("stops everyone at the company cap", () => {
    expect(capBlock(cap, { user: 0, total: 2000 })).toMatch(/company limit of ₹2,000/);
  });

  it("does nothing without caps", () => {
    expect(capBlock({ perUserInr: null, totalInr: null }, { user: 1e6, total: 1e6 })).toBeNull();
  });
});
