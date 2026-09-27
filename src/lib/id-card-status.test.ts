import { describe, expect, it } from "vitest";
import {
  ID_CARD_STATUSES,
  ID_CARD_STATUS_VALUES,
  idCardStatusLabel,
} from "./id-card-status";

describe("ID card statuses", () => {
  it("lists the workflow in order", () => {
    expect(ID_CARD_STATUS_VALUES).toEqual([
      "PHOTO_TAKEN",
      "ASSIGNED_TO_DESIGNER",
      "PENDING",
      "ISSUED",
      "RE_ISSUE",
      "RETURN_PENDING",
      "RETURNED",
    ]);
    expect(ID_CARD_STATUSES).toHaveLength(ID_CARD_STATUS_VALUES.length);
  });

  it("labels known statuses", () => {
    expect(idCardStatusLabel("ASSIGNED_TO_DESIGNER")).toBe(
      "Assigned to Designer",
    );
    expect(idCardStatusLabel("RE_ISSUE")).toBe("Re Issue");
  });

  it("passes retired statuses from old history rows through unchanged", () => {
    expect(idCardStatusLabel("CORRECTION")).toBe("CORRECTION");
  });
});
