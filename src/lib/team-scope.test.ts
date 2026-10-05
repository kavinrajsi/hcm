import { describe, expect, it } from "vitest";
import { teamEmployeeWhere } from "./team-scope";

describe("teamEmployeeWhere", () => {
  it("limits managers to their direct reports", () => {
    expect(teamEmployeeWhere({ id: "m1", role: "MANAGER" })).toEqual({ manager: { userId: "m1" } });
  });

  it("leaves HR unrestricted", () => {
    expect(teamEmployeeWhere({ id: "hr", role: "HR_ADMIN" })).toEqual({});
  });
});
