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
    expect(Object.keys(view).sort()).toEqual(["assetTag", "brand", "model", "owner", "type"]);
    expect(JSON.stringify(view)).not.toMatch(/Asha|e1|99999|C02XYZ/);
  });

  it("hides the Not given model and names the vendor as owner, like the sticker", () => {
    const view = publicDeviceView({
      assetTag: "MAD-LAP-0002",
      type: "LAPTOP",
      brand: "HP",
      model: "Not given",
      vendor: { name: "Acme Rentals" },
    });
    expect(view.model).toBe("");
    expect(view.owner).toBe("Acme Rentals");
  });

  it("falls back to Madarth when no vendor is set", () => {
    const view = publicDeviceView({ assetTag: "MAD-LAP-0003", type: "LAPTOP", brand: "HP", model: "Envy", vendor: null });
    expect(view.owner).toBe("Madarth");
  });
});
