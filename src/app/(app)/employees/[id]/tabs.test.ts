import { describe, expect, it } from "vitest";
import { employeeTab, employeeTabHref } from "./tabs";

describe("employee tabs", () => {
  it("opens Profile unless ?tab= names another tab", () => {
    expect(employeeTab(undefined)).toBe("profile");
    expect(employeeTab("leave")).toBe("leave");
    expect(employeeTab("career")).toBe("career");
    expect(employeeTab("id-card")).toBe("id-card");
    expect(employeeTab("nonsense")).toBe("profile");
    expect(employeeTab(["leave"])).toBe("profile");
    // Basecamp moved under Login; old links still land there.
    expect(employeeTab("basecamp")).toBe("login");
  });

  it("builds tab links, Profile without a query", () => {
    expect(employeeTabHref("e1", "profile")).toBe("/employees/e1");
    expect(employeeTabHref("e1", "leave", { leaveYear: "2025" })).toBe("/employees/e1?tab=leave&leaveYear=2025");
  });
});
