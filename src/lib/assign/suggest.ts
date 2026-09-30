import type { JobKind } from "@/lib/assign/taxonomy";

// Who could take a new job, worked out from the record. Ordinary counting:
// how many of a designer's similar past jobs needed no correction. No model
// here, no deadlines, and no score or rank for a person — the output is a
// safe pick, a learning pick with its risk spelled out, and the evidence,
// or an honest "not enough history".

/** Fewest similar jobs before the record says anything about a designer. */
export const MIN_SIMILAR = 3;
/** Fewest jobs of any kind before someone is offered as a learning pick. */
export const MIN_OVERALL = 5;

export type DesignerRef = {
  personId: string;
  name: string;
  title: string | null;
  avatarKey: string | null;
};

export type JobEvidence = {
  id: string;
  title: string;
  link: string;
  bucketName: string;
  completedAt: string; // ISO
  kind: string;
  coordinatorId: string;
  coordinatorName: string;
  corrections: number; // comments read as CORRECTION
  labelSource: "manual" | "ai" | "none";
};

export type DesignerHistory = { designer: DesignerRef; jobs: JobEvidence[] };

export type DesignerEvidence = {
  designer: DesignerRef;
  similar: JobEvidence[]; // same kind (and coordinator, when given)
  clean: number; // similar jobs with no correction
  corrections: number; // total corrections across similar jobs
  overall: { jobs: number; clean: number }; // every kind, every coordinator
};

export type SuggestionResult = {
  kind: JobKind;
  coordinatorId: string | null;
  minSimilar: number;
  status: "ok" | "no-history";
  safe: DesignerEvidence | null;
  safeReason: string;
  safeTies: DesignerRef[];
  learning: DesignerEvidence | null;
  learningRisk: string;
  /** Everyone else with at least one similar job, alphabetical on purpose. */
  others: DesignerEvidence[];
  note: string;
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function share(evidence: DesignerEvidence) {
  return evidence.similar.length ? evidence.clean / evidence.similar.length : 0;
}

function overallShare(evidence: DesignerEvidence) {
  return evidence.overall.jobs ? evidence.overall.clean / evidence.overall.jobs : 0;
}

/** "3 of 4 similar jobs needed no correction" */
export function describeRecord(evidence: DesignerEvidence): string {
  const n = evidence.similar.length;
  if (n === 0) return "no similar jobs on record";
  return `${evidence.clean} of ${plural(n, "similar job")} needed no correction`;
}

export function buildEvidence(
  history: DesignerHistory,
  kind: string,
  coordinatorId: string | null,
): DesignerEvidence {
  const similar = history.jobs
    .filter(
      (job) =>
        job.kind === kind &&
        (coordinatorId === null || job.coordinatorId === coordinatorId),
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return {
    designer: history.designer,
    similar,
    clean: similar.filter((job) => job.corrections === 0).length,
    corrections: similar.reduce((sum, job) => sum + job.corrections, 0),
    overall: {
      jobs: history.jobs.length,
      clean: history.jobs.filter((job) => job.corrections === 0).length,
    },
  };
}

export function suggest(input: {
  kind: JobKind;
  coordinatorId: string | null;
  histories: DesignerHistory[];
}): SuggestionResult {
  const { kind, coordinatorId } = input;
  const all = input.histories
    .map((history) => buildEvidence(history, kind, coordinatorId))
    .sort((a, b) => a.designer.name.localeCompare(b.designer.name));

  const eligible = all.filter((e) => e.similar.length >= MIN_SIMILAR);
  const best = eligible.reduce<DesignerEvidence | null>((top, candidate) => {
    if (!top) return candidate;
    const byShare = share(candidate) - share(top);
    if (byShare !== 0) return byShare > 0 ? candidate : top;
    const bySize = candidate.similar.length - top.similar.length;
    if (bySize !== 0) return bySize > 0 ? candidate : top;
    return candidate.corrections < top.corrections ? candidate : top;
  }, null);
  const safeTies = best
    ? eligible
        .filter(
          (e) =>
            e !== best &&
            share(e) === share(best) &&
            e.similar.length === best.similar.length &&
            e.corrections === best.corrections,
        )
        .map((e) => e.designer)
    : [];

  const learning =
    all
      .filter(
        (e) =>
          e !== best &&
          e.similar.length < MIN_SIMILAR &&
          e.overall.jobs >= MIN_OVERALL,
      )
      .reduce<DesignerEvidence | null>((top, candidate) => {
        if (!top) return candidate;
        const byShare = overallShare(candidate) - overallShare(top);
        if (byShare !== 0) return byShare > 0 ? candidate : top;
        return candidate.overall.jobs > top.overall.jobs ? candidate : top;
      }, null) ?? null;

  const others = all.filter(
    (e) => e !== best && e !== learning && e.similar.length > 0,
  );

  const scope = coordinatorId
    ? "under this coordinator"
    : "across all coordinators";
  const safeReason = best
    ? `${describeRecord(best)} ${scope}.` +
      (safeTies.length
        ? ` ${safeTies.map((d) => d.name).join(", ")} ${safeTies.length === 1 ? "has" : "have"} the same record.`
        : "")
    : eligible.length === 0
      ? `Nobody has ${MIN_SIMILAR} or more similar jobs ${scope}, so the record can't say who is the safe pick.`
      : "";
  const learningRisk = learning
    ? `Only ${plural(learning.similar.length, "similar job")} on record ${scope}` +
      (learning.similar.length
        ? ` (${learning.clean} without correction)`
        : "") +
      `; ${learning.overall.clean} of ${plural(learning.overall.jobs, "job")} of any kind needed no correction. ` +
      `The record says little about them on this kind of work, so expect at least one extra round.`
    : "";

  return {
    kind,
    coordinatorId,
    minSimilar: MIN_SIMILAR,
    status: best ? "ok" : "no-history",
    safe: best,
    safeReason,
    safeTies,
    learning,
    learningRisk,
    others,
    note:
      "Rework counts describe the job — brief, client and coordinator included — not the designer alone. " +
      "Open the jobs before deciding.",
  };
}
