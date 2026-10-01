import { describe, expect, it } from "vitest";
import { DEFAULT_LAPTOP_OS, osSuffix, readLaptopOsMap, recommendedOs } from "./os";

describe("laptop OS by designation", () => {
  it("starts with Madarth's rules", () => {
    expect(DEFAULT_LAPTOP_OS).toEqual({
      Copywriter: "WINDOWS",
      Designer: "MAC",
      SMM: "WINDOWS",
      CGP: "WINDOWS",
      Editor: "MAC",
      BD: "MAC",
      "UI/UX Designer": "MAC",
      HCM: "WINDOWS",
    });
  });

  it("matches designations ignoring case and spaces", () => {
    expect(recommendedOs("designer", DEFAULT_LAPTOP_OS)).toBe("MAC");
    expect(recommendedOs(" UI/UX Designer ", DEFAULT_LAPTOP_OS)).toBe("MAC");
    expect(recommendedOs("Copywriter", DEFAULT_LAPTOP_OS)).toBe("WINDOWS");
  });

  it("has no opinion on roles without a rule", () => {
    expect(recommendedOs("SEO", DEFAULT_LAPTOP_OS)).toBeNull();
    expect(recommendedOs("", DEFAULT_LAPTOP_OS)).toBeNull();
    expect(recommendedOs(null, DEFAULT_LAPTOP_OS)).toBeNull();
  });

  it("uses a stored map, or the defaults if it's malformed", () => {
    expect(readLaptopOsMap({ SEO: "WINDOWS" })).toEqual({ SEO: "WINDOWS" });
    expect(readLaptopOsMap({ SEO: "LINUX" })).toEqual(DEFAULT_LAPTOP_OS);
    expect(readLaptopOsMap(null)).toEqual(DEFAULT_LAPTOP_OS);
  });

  it("formats a suffix", () => {
    expect(osSuffix("MAC")).toBe(" (Mac)");
    expect(osSuffix(null)).toBe("");
  });
});
