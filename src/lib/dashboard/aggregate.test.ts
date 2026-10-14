import { describe, expect, it } from "vitest";
import { changeText, formatValue, groupByField, groupByTime, totalOf } from "./aggregate";

const row = (day: string | null, value: number, keys: Record<string, string | string[]> = {}) => ({ day, value, keys });

describe("groupByTime", () => {
  it("fills empty months across the range", () => {
    const groups = groupByTime([row("2026-08-03", 2), row("2026-10-20", 1), row(null, 5)], "month", {
      from: "2026-08-01",
      to: "2026-11-01",
    });
    expect(groups).toEqual([
      { key: "2026-08", label: "Aug 26", value: 2 },
      { key: "2026-09", label: "Sep 26", value: 0 },
      { key: "2026-10", label: "Oct 26", value: 1 },
    ]);
  });

  it("uses the data's own span when the range is open", () => {
    const groups = groupByTime([row("2026-01-10", 1), row("2026-03-01", 1)], "month", {});
    expect(groups.map((group) => group.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(groupByTime([], "month", {})).toEqual([]);
  });
});

describe("groupByField", () => {
  const labels = new Map([
    ["A", "Alpha"],
    ["B", "Beta"],
  ]);

  it("sums, labels and sorts biggest first", () => {
    const groups = groupByField([row(null, 1, { team: "A" }), row(null, 3, { team: "B" }), row(null, 1, { team: "A" })], "team", labels, 10);
    expect(groups).toEqual([
      { key: "B", label: "Beta", value: 3 },
      { key: "A", label: "Alpha", value: 2 },
    ]);
  });

  it("counts a row under each of its values once (assignees)", () => {
    const groups = groupByField([row(null, 1, { who: ["x", "y", "x"] })], "who", new Map(), 10);
    expect(groups).toEqual([
      { key: "x", label: "x", value: 1 },
      { key: "y", label: "y", value: 1 },
    ]);
  });

  it("folds the rest into Other", () => {
    const rows = ["a", "b", "c", "d"].map((key, index) => row(null, 10 - index, { k: key }));
    const groups = groupByField(rows, "k", new Map(), 2);
    expect(groups.map((group) => [group.key, group.value])).toEqual([
      ["a", 10],
      ["b", 9],
      ["__other", 15],
    ]);
    expect(groups[2].label).toBe("Other (2)");
  });
});

describe("formatting", () => {
  it("totals count each row once", () => {
    expect(totalOf([row(null, 1, { who: ["x", "y"] }), row(null, 2)])).toBe(3);
  });

  it("formats counts, hours and days", () => {
    expect(formatValue(123456)).toBe("1,23,456");
    expect(formatValue(12.345, "h")).toBe("12.3 h");
    expect(formatValue(1, "days")).toBe("1 day");
    expect(formatValue(3.5, "days")).toBe("3.5 days");
  });

  it("describes the change against the previous period", () => {
    expect(changeText(12, 10)).toBe("+20%");
    expect(changeText(5, 10)).toBe("−50%");
    expect(changeText(3, 0)).toBe("New");
    expect(changeText(0, 0)).toBe("No change");
    expect(changeText(4, null)).toBeNull();
  });
});
