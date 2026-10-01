import { describe, expect, it } from "vitest";
import {
  DEFAULT_PURCHASE_EMAIL,
  parseEmailList,
  purchaseRequestEmail,
  readPurchaseEmailSettings,
  vendorCatalog,
} from "./purchase";

describe("parseEmailList", () => {
  it("splits on commas, semicolons, spaces and new lines; lower-cases and de-duplicates", () => {
    expect(parseEmailList("Admin@madarth.com, hr@madarth.com;\nadmin@madarth.com  it@madarth.com")).toEqual({
      ok: true,
      emails: ["admin@madarth.com", "hr@madarth.com", "it@madarth.com"],
    });
    expect(parseEmailList("")).toEqual({ ok: true, emails: [] });
  });
  it("names the first bad address", () => {
    expect(parseEmailList("hr@madarth.com, not-an-email")).toEqual({
      ok: false,
      error: `"not-an-email" isn't a valid email address`,
    });
  });
});

describe("readPurchaseEmailSettings", () => {
  it("falls back to the defaults when nothing valid is stored", () => {
    expect(readPurchaseEmailSettings(null)).toEqual(DEFAULT_PURCHASE_EMAIL);
    expect(readPurchaseEmailSettings({ replyTo: "x", cc: [] })).toEqual(DEFAULT_PURCHASE_EMAIL);
  });
  it("keeps a valid stored value", () => {
    const value = { replyTo: "it@madarth.com", cc: ["finance@madarth.com"] };
    expect(readPurchaseEmailSettings(value)).toEqual(value);
  });
  it("starts with admin, hr and finance copied, replies to admin", () => {
    expect(DEFAULT_PURCHASE_EMAIL).toEqual({
      replyTo: "admin@madarth.com",
      cc: ["admin@madarth.com", "hr@madarth.com", "finance@madarth.com"],
    });
  });
});

describe("purchaseRequestEmail", () => {
  const input = {
    vendorName: "Croma",
    contactPerson: "Ravi",
    type: "LAPTOP" as const,
    itemName: "MacBook Air <M3>",
    quantity: 2,
    neededBy: new Date("2026-10-15"),
    notes: "Please include\na charger",
    replyTo: "admin@madarth.com",
  };

  it("says what, how many and by when, escaped, with the reply-to in the footer", () => {
    const { subject, html } = purchaseRequestEmail(input);
    expect(subject).toBe("Device request from Madarth: 2 × MacBook Air <M3>");
    expect(html).toContain("Hi Ravi,");
    expect(html).toContain("Laptop: MacBook Air &lt;M3&gt;");
    expect(html).toContain("15/10/2026");
    expect(html).toContain("Please include<br>a charger");
    expect(html).toContain("replies go to");
    expect(html).toContain("admin@madarth.com");
    expect(html).not.toContain("replies aren't monitored");
  });

  it("names the OS when one is asked for", () => {
    expect(purchaseRequestEmail({ ...input, os: "WINDOWS" }).html).toContain("Laptop (Windows): MacBook Air");
  });

  it("greets generically without a contact person and skips an empty needed-by", () => {
    const { html } = purchaseRequestEmail({ ...input, contactPerson: null, neededBy: null });
    expect(html).toContain("Hello,");
    expect(html).not.toContain("Needed by");
  });
});

describe("vendorCatalog", () => {
  it("lists each type/brand/model once, in the given order", () => {
    expect(
      vendorCatalog([
        { type: "LAPTOP", brand: "Dell", model: "Latitude 5440" },
        { type: "MOUSE", brand: "Logitech", model: "M331" },
        { type: "LAPTOP", brand: "dell", model: "latitude 5440" },
      ]),
    ).toEqual([
      { type: "LAPTOP", name: "Dell Latitude 5440" },
      { type: "MOUSE", name: "Logitech M331" },
    ]);
  });
});
