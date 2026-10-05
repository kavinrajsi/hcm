import { describe, expect, it } from "vitest";
import { findCurrent } from "./nav";

describe("findCurrent", () => {
  it("prefers the longest match", () => {
    expect(findCurrent("/sessions/attended")?.item.title).toBe("Session Attendance");
    expect(findCurrent("/profile/security")?.item.title).toBe("Security");
  });

  it("keeps the Learning dashboard to its own URL", () => {
    expect(findCurrent("/learning")?.item.title).toBe("Dashboard");
    expect(findCurrent("/learning/manage/abc")?.item.title).toBe("Manage courses");
  });

  it("files course pages under My learning", () => {
    expect(findCurrent("/learning/courses/abc")).toEqual({
      group: "Learning",
      item: expect.objectContaining({ title: "My learning" }),
    });
  });

  it("matches the root only exactly", () => {
    expect(findCurrent("/")?.item.title).toBe("Dashboard");
    expect(findCurrent("/nope")).toBeUndefined();
  });
});
