import { COMMENT_CATEGORIES, type CommentCategory } from "@/lib/assign/taxonomy";

// Measuring the reading, not assuming it: which labels count for a comment,
// how much two coordinators agree, and how the model does against them.

/**
 * The labels a comment is taken to have. Coordinator labels win over the
 * model's; with several coordinators, a category counts when at least half
 * of them chose it (so two who disagree both get heard).
 */
export function effectiveLabels(
  manual: string[][],
  ai: string[],
): { labels: string[]; source: "manual" | "ai" | "none" } {
  if (manual.length > 0) {
    const counts = new Map<string, number>();
    for (const labels of manual)
      for (const label of new Set(labels))
        counts.set(label, (counts.get(label) ?? 0) + 1);
    const labels = COMMENT_CATEGORIES.filter(
      (category) => (counts.get(category) ?? 0) * 2 >= manual.length,
    );
    return { labels, source: "manual" };
  }
  if (ai.length > 0) return { labels: ai, source: "ai" };
  return { labels: [], source: "none" };
}

export type BinaryMetrics = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  support: number; // truth positives
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

/** Precision/recall/F1 of a yes/no prediction; null where undefined (0/0). */
export function binaryMetrics(
  predicted: boolean[],
  truth: boolean[],
): BinaryMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < truth.length; i++) {
    if (predicted[i] && truth[i]) tp++;
    else if (predicted[i] && !truth[i]) fp++;
    else if (!predicted[i] && truth[i]) fn++;
    else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { tp, fp, fn, tn, support: tp + fn, precision, recall, f1 };
}

/**
 * Cohen's kappa for two yes/no raters over the same items. Null when there
 * are no items or when chance agreement is total (no variance to explain).
 */
export function cohenKappa(a: boolean[], b: boolean[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n === 0) return null;
  let both = 0;
  let neither = 0;
  let aYes = 0;
  let bYes = 0;
  for (let i = 0; i < n; i++) {
    if (a[i]) aYes++;
    if (b[i]) bYes++;
    if (a[i] && b[i]) both++;
    if (!a[i] && !b[i]) neither++;
  }
  const observed = (both + neither) / n;
  const expected =
    (aYes / n) * (bYes / n) + ((n - aYes) / n) * ((n - bYes) / n);
  if (expected === 1) return null;
  return (observed - expected) / (1 - expected);
}

export type CategoryAgreement = {
  category: CommentCategory;
  n: number;
  agreePercent: number;
  kappa: number | null;
};

/** Per-category agreement between two raters' label sets on shared items. */
export function categoryAgreement(
  pairs: { a: string[]; b: string[] }[],
): CategoryAgreement[] {
  return COMMENT_CATEGORIES.map((category) => {
    const a = pairs.map((pair) => pair.a.includes(category));
    const b = pairs.map((pair) => pair.b.includes(category));
    const agree = a.filter((value, i) => value === b[i]).length;
    return {
      category,
      n: pairs.length,
      agreePercent: pairs.length ? Math.round((agree / pairs.length) * 100) : 0,
      kappa: cohenKappa(a, b),
    };
  });
}

export type CategoryMetrics = BinaryMetrics & { category: CommentCategory };

/** Per-category model scores against the coordinators' labels. */
export function categoryMetrics(
  pairs: { predicted: string[]; truth: string[] }[],
): CategoryMetrics[] {
  return COMMENT_CATEGORIES.map((category) => ({
    category,
    ...binaryMetrics(
      pairs.map((pair) => pair.predicted.includes(category)),
      pairs.map((pair) => pair.truth.includes(category)),
    ),
  }));
}

/** Plain reading of a kappa value (Landis & Koch bands). */
export function describeKappa(kappa: number | null): string {
  if (kappa === null) return "not measurable";
  if (kappa < 0) return "worse than chance";
  if (kappa < 0.2) return "slight";
  if (kappa < 0.4) return "fair";
  if (kappa < 0.6) return "moderate";
  if (kappa < 0.8) return "substantial";
  return "almost perfect";
}

/**
 * Splits a drawn sample into train / dev / holdout with a fixed-order
 * shuffle (Fisher–Yates on the given random source), holdout first so the
 * locked set is the same size whatever the sample size.
 */
export function splitSample<T>(
  items: T[],
  sizes: { holdout: number; dev: number },
  random: () => number = Math.random,
): { train: T[]; dev: T[]; holdout: T[] } {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const holdout = pool.splice(0, sizes.holdout);
  const dev = pool.splice(0, sizes.dev);
  return { train: pool, dev, holdout };
}
