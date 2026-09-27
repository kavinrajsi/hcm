import { describe, expect, it } from "vitest";
import {
  celebrationsForMonth,
  dayInMonth,
  ordinal,
  relativeDay,
  type Celebrant,
} from "./celebrations";

const person = (p: Partial<Celebrant>): Celebrant => ({
  id: "e1",
  empId: "E1",
  name: "Asha",
  department: "Design",
  dateOfBirth: null,
  dateOfJoining: "2024-01-01",
  ...p,
});

describe("dayInMonth", () => {
  it("returns the day when the month matches", () => {
    expect(dayInMonth("1990-10-15", 2026, 10)).toBe(15);
    expect(dayInMonth("1990-10-15", 2026, 9)).toBeNull();
  });

  it("moves 29 Feb to 28 Feb outside leap years", () => {
    expect(dayInMonth("1996-02-29", 2026, 2)).toBe(28);
    expect(dayInMonth("1996-02-29", 2028, 2)).toBe(29);
  });
});

describe("celebrationsForMonth", () => {
  it("lists birthdays and anniversaries in the month, sorted by day", () => {
    const list = celebrationsForMonth(
      [
        person({
          id: "a",
          name: "Asha",
          dateOfBirth: "1995-10-20",
          dateOfJoining: "2023-10-03",
        }),
        person({
          id: "b",
          name: "Ravi",
          dateOfBirth: "1990-10-03",
          dateOfJoining: "2025-06-01",
        }),
        person({
          id: "c",
          name: "Mani",
          dateOfBirth: "1992-04-11",
          dateOfJoining: "2021-12-01",
        }),
      ],
      2026,
      10,
    );
    expect(list.map((c) => [c.day, c.type, c.employee.name, c.years])).toEqual([
      [3, "ANNIVERSARY", "Asha", 3],
      [3, "BIRTHDAY", "Ravi", undefined],
      [20, "BIRTHDAY", "Asha", undefined],
    ]);
    expect(list[0].date).toBe("2026-10-03");
  });

  it("skips the joining year itself (no 0-year anniversary)", () => {
    const list = celebrationsForMonth(
      [person({ dateOfJoining: "2026-10-01" })],
      2026,
      10,
    );
    expect(list).toEqual([]);
  });

  it("ignores a missing date of birth", () => {
    expect(
      celebrationsForMonth([person({ dateOfBirth: null })], 2026, 3),
    ).toEqual([]);
  });

  it("never exposes the birth year", () => {
    const [b] = celebrationsForMonth(
      [person({ dateOfBirth: "1988-05-09" })],
      2026,
      5,
    );
    expect(JSON.stringify(b)).not.toContain("1988");
  });
});

describe("relativeDay", () => {
  it("describes the distance from today", () => {
    expect(relativeDay("2026-09-28", "2026-09-28")).toBe("Today");
    expect(relativeDay("2026-09-29", "2026-09-28")).toBe("Tomorrow");
    expect(relativeDay("2026-10-03", "2026-09-28")).toBe("in 5 days");
    expect(relativeDay("2026-09-25", "2026-09-28")).toBe("3 days ago");
  });
});

describe("ordinal", () => {
  it("adds the right suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
    ]);
  });
});
