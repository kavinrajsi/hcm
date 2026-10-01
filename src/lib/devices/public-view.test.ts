import { describe, expect, it } from "vitest";
import { publicDeviceView } from "./public-view";

describe("publicDeviceView", () => {
  it("never carries holder or purchase details", () => {
    const row = {
      assetTag: "MAD-LAP-0001",
      type: "LAPTOP" as const,
      brand: "Apple",
      model: "MacBook Air",
      holder: { userId: "u1", name: "Asha", manager: null },
      holderId: "e1",
      purchasePrice: "99999",
      serialNumber: "C02XYZ",
    };
    const view = publicDeviceView(row);
    expect(Object.keys(view).sort()).toEqual(["assetTag", "brand", "model", "type"]);
    expect(JSON.stringify(view)).not.toMatch(/Asha|e1|99999|C02XYZ/);
  });
});
