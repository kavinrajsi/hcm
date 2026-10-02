import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { pickSharedJobs, readSharedJobIds } from "./shared";

describe("readSharedJobIds", () => {
  it("reads the stored ids and ignores anything else", () => {
    expect(readSharedJobIds({ jobIds: ["a", "b", 3] })).toEqual(["a", "b"]);
    expect(readSharedJobIds(undefined)).toEqual([]);
    expect(readSharedJobIds({ jobIds: "a" })).toEqual([]);
  });
});

describe("pickSharedJobs", () => {
  const train = Array.from({ length: 60 }, (_, i) => `j${i}`);

  it("picks 30 distinct train jobs", () => {
    const picked = pickSharedJobs(train, []);
    expect(picked).toHaveLength(30);
    expect(new Set(picked).size).toBe(30);
    expect(picked.every((id) => train.includes(id))).toBe(true);
  });

  it("never re-picks once a shared set exists", () => {
    expect(pickSharedJobs(train, ["x", "y"])).toEqual(["x", "y"]);
  });

  it("takes all of train when it has fewer than 30", () => {
    expect(pickSharedJobs(["a", "b"], [])).toHaveLength(2);
  });
});
