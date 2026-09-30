import { describe, expect, it } from "vitest";
import {
  binaryMetrics,
  categoryAgreement,
  categoryMetrics,
  cohenKappa,
  describeKappa,
  effectiveLabels,
  splitSample,
} from "./eval";

describe("effectiveLabels", () => {
  it("uses the model when nobody has labelled the comment", () => {
    expect(effectiveLabels([], ["CORRECTION"])).toEqual({
      labels: ["CORRECTION"],
      source: "ai",
    });
    expect(effectiveLabels([], [])).toEqual({ labels: [], source: "none" });
  });

  it("takes a category when at least half the coordinators chose it", () => {
    expect(
      effectiveLabels([["CORRECTION", "TIMING"], ["CLIENT_CHANGE", "TIMING"]], ["OTHER"]),
    ).toEqual({
      labels: ["CORRECTION", "CLIENT_CHANGE", "TIMING"],
      source: "manual",
    });
    expect(
      effectiveLabels([["CORRECTION"], ["OTHER"], ["OTHER"]], []).labels,
    ).toEqual(["OTHER"]);
  });
});

describe("binaryMetrics", () => {
  it("computes precision, recall and F1", () => {
    const metrics = binaryMetrics(
      [true, true, false, false, true],
      [true, false, true, false, true],
    );
    expect(metrics).toMatchObject({ tp: 2, fp: 1, fn: 1, tn: 1, support: 3 });
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBeCloseTo(2 / 3);
    expect(metrics.f1).toBeCloseTo(2 / 3);
  });

  it("leaves undefined ratios null instead of 0", () => {
    const metrics = binaryMetrics([false, false], [false, false]);
    expect(metrics.precision).toBeNull();
    expect(metrics.recall).toBeNull();
    expect(metrics.f1).toBeNull();
  });
});

describe("cohenKappa", () => {
  it("is 1 for perfect agreement and 0 for chance", () => {
    expect(cohenKappa([true, false, true], [true, false, true])).toBe(1);
    // a says yes to half at random, b says yes to the other half.
    expect(cohenKappa([true, true, false, false], [true, false, true, false])).toBe(0);
  });

  it("is null without items or without variance", () => {
    expect(cohenKappa([], [])).toBeNull();
    expect(cohenKappa([true, true], [true, true])).toBeNull();
  });

  it("describes bands in words", () => {
    expect(describeKappa(null)).toBe("not measurable");
    expect(describeKappa(0.3)).toBe("fair");
    expect(describeKappa(0.75)).toBe("substantial");
    expect(describeKappa(0.9)).toBe("almost perfect");
  });
});

describe("categoryAgreement / categoryMetrics", () => {
  const pairs = [
    { a: ["CORRECTION"], b: ["CORRECTION"] },
    { a: ["CLIENT_CHANGE"], b: ["CORRECTION"] },
    { a: ["HANDOFF"], b: ["HANDOFF"] },
    { a: ["OTHER"], b: ["OTHER", "TIMING"] },
  ];

  it("scores each category on its own", () => {
    const correction = categoryAgreement(pairs).find(
      (row) => row.category === "CORRECTION",
    )!;
    expect(correction.n).toBe(4);
    expect(correction.agreePercent).toBe(75);
    expect(correction.kappa).toBeCloseTo(0.5);
  });

  it("measures the model against the truth per category", () => {
    const metrics = categoryMetrics(
      pairs.map((pair) => ({ predicted: pair.a, truth: pair.b })),
    );
    const correction = metrics.find((row) => row.category === "CORRECTION")!;
    expect(correction).toMatchObject({ tp: 1, fp: 0, fn: 1, support: 2 });
    expect(correction.precision).toBe(1);
    expect(correction.recall).toBe(0.5);
  });
});

describe("splitSample", () => {
  it("locks the holdout first and gives the rest to train", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let seed = 0;
    const split = splitSample(items, { holdout: 3, dev: 2 }, () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    });
    expect(split.holdout).toHaveLength(3);
    expect(split.dev).toHaveLength(2);
    expect(split.train).toHaveLength(5);
    expect(
      [...split.holdout, ...split.dev, ...split.train].sort((a, b) => a - b),
    ).toEqual(items);
  });

  it("copes with fewer items than the requested sets", () => {
    const split = splitSample([1, 2], { holdout: 3, dev: 2 });
    expect(split.holdout).toHaveLength(2);
    expect(split.dev).toEqual([]);
    expect(split.train).toEqual([]);
  });
});
