import { describe, expect, it } from "vitest";
import { WIN_RENTALS, rentalDevice } from "./win-rentals";
import { nextAssetTag } from "./devices";

describe("Win Technologies rentals", () => {
  it("has the 8 laptops at ₹23,900 a month in total", () => {
    expect(WIN_RENTALS).toHaveLength(8);
    expect(WIN_RENTALS.reduce((sum, row) => sum + Number(row.monthlyRent), 0)).toBe(23900);
    expect(new Set(WIN_RENTALS.map((row) => row.serial)).size).toBe(8);
  });

  it("splits brand from model and infers the OS", () => {
    expect(rentalDevice(WIN_RENTALS[0])).toEqual({
      brand: "HP",
      model: "Elitebook Folio 1040 G3",
      os: "WINDOWS",
      serialNumber: "5CD6416G9D",
      vendorRef: "Laptop1",
      monthlyRent: "2000.00",
    });
    expect(rentalDevice(WIN_RENTALS[2])).toMatchObject({
      brand: "Apple",
      model: "MacBook Pro (A2338-2020) M1 13inch",
      os: "MAC",
      monthlyRent: "7500.00",
    });
  });

  it("gets asset tags in Laptop1→8 order when imported in list order", () => {
    const tags: string[] = [];
    WIN_RENTALS.forEach(() => tags.push(nextAssetTag("LAPTOP", tags)));
    expect(tags[0]).toBe("MAD-LAP-0001");
    expect(tags[7]).toBe("MAD-LAP-0008");
  });
});
