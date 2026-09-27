import { describe, expect, it } from "vitest";
import { buildEmailIndex, htmlToText, leaveTotalsConditions, leaveTotalsPeriod, parseNextLink } from "./leave";

describe("htmlToText", () => {
  it("strips Basecamp rich text to plain lines", () => {
    const html =
      '<p dir="auto">Hi Team,</p><p dir="auto"><br></p><p dir="auto">I&#39;m taking leave on October 6 &amp; 7.</p>' +
      '<bc-attachment sgid="abc" content-type="application/vnd.basecamp.mention"><figure><img src="x"></figure></bc-attachment>';
    expect(htmlToText(html)).toBe("Hi Team,\nI'm taking leave on October 6 & 7.");
  });

  it("handles self-closing attachments and br", () => {
    expect(htmlToText('Late<br>by 11<bc-attachment sgid="x"/>')).toBe("Late\nby 11");
  });
});

describe("buildEmailIndex", () => {
  it("matches work and personal emails case-insensitively, work email wins", () => {
    const index = buildEmailIndex([
      { id: "a", workEmail: "A@madarth.com", personalEmail: "a@gmail.com" },
      { id: "b", workEmail: "b@madarth.com", personalEmail: "a@madarth.com" },
    ]);
    expect(index.get("a@gmail.com")).toBe("a");
    expect(index.get("a@madarth.com")).toBe("a");
    expect(index.get("b@madarth.com")).toBe("b");
  });
});

describe("parseNextLink", () => {
  it("extracts rel=next", () => {
    expect(
      parseNextLink('<https://3.basecampapi.com/1/x.json?page=3>; rel="next"'),
    ).toBe("https://3.basecampapi.com/1/x.json?page=3");
  });
  it("returns null without a next link", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://x>; rel="prev"')).toBeNull();
  });
});

describe("leaveTotalsConditions", () => {
  const yearStart = new Date(Date.UTC(2026, 0, 1));

  it("defaults to full + half days this year, excluding rejected", () => {
    expect(leaveTotalsConditions({ yearStart })).toEqual([
      { employeeId: { not: null } },
      { type: { in: ["FULL_DAY", "HALF_DAY"] } },
      { status: { not: "REJECTED" } },
      { startDate: { gte: yearStart } },
    ]);
  });

  it("applies name search, a single day type, status, and a date range", () => {
    const range = { gte: new Date(Date.UTC(2026, 2, 1)), lt: new Date(Date.UTC(2026, 3, 1)) };
    const conditions = leaveTotalsConditions({ q: "asha", type: "HALF_DAY", status: "APPROVED", range, yearStart });
    expect(conditions).toContainEqual({ type: "HALF_DAY" });
    expect(conditions).toContainEqual({ status: "APPROVED" });
    expect(conditions).toContainEqual({ OR: [{ startDate: range }, { startDate: null, postedOn: range }] });
    expect(conditions).toContainEqual({
      OR: [
        { creatorName: { contains: "asha", mode: "insensitive" } },
        { employee: { name: { contains: "asha", mode: "insensitive" } } },
        { message: { contains: "asha", mode: "insensitive" } },
      ],
    });
  });

  it("returns null for types that can't give per-employee day totals", () => {
    for (const type of ["UNCLASSIFIED", "UNMATCHED", "WFH", "LATE_ARRIVAL"]) {
      expect(leaveTotalsConditions({ type, yearStart })).toBeNull();
    }
  });
});

describe("leaveTotalsPeriod", () => {
  const now = new Date(Date.UTC(2026, 8, 28));
  it("labels year, month, and day filters", () => {
    expect(leaveTotalsPeriod({}, now)).toBe("in 2026");
    expect(leaveTotalsPeriod({ year: 2025 }, now)).toBe("in 2025");
    expect(leaveTotalsPeriod({ month: 3 }, now)).toBe("in March 2026");
    expect(leaveTotalsPeriod({ month: 3, day: 12, year: 2025 }, now)).toBe("on 12 Mar 2025");
    expect(leaveTotalsPeriod({ day: 5 }, now)).toBe("on 5 Sept 2026");
  });
});
