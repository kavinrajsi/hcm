"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { classifyDescription, classifyPending } from "@/lib/assign/classify";
import { listDesigners, loadHistories } from "@/lib/assign/data";
import { splitSample } from "@/lib/assign/eval";
import { suggest, type SuggestionResult } from "@/lib/assign/suggest";
import {
  BELIEF_LEVELS,
  JOB_KINDS,
  isBeliefLevel,
  isJobKind,
  normalizeCategories,
} from "@/lib/assign/taxonomy";

const ASSIGN_ROLES = ["HR_ADMIN", "MANAGER"] as const;

// --- Who should take this? ---

const askSchema = z.object({
  description: z.string().trim().min(10, "Describe the job in a sentence or two."),
  coordinatorId: z.string().trim().optional(),
  kind: z.string().trim().optional(),
});

export type AskState = {
  error?: string;
  queryId?: string;
  kindBy?: "ai" | "manual";
  result?: SuggestionResult;
};

export async function askSuggestion(
  _prev: AskState,
  formData: FormData,
): Promise<AskState> {
  const user = await requireRole(...ASSIGN_ROLES);
  const parsed = askSchema.safeParse({
    description: formData.get("description"),
    coordinatorId: formData.get("coordinatorId") ?? undefined,
    kind: formData.get("kind") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const { description } = parsed.data;
  const coordinatorId = parsed.data.coordinatorId || null;

  let kindBy: "ai" | "manual" = "manual";
  let kind = isJobKind(parsed.data.kind) ? parsed.data.kind : null;
  if (!kind) {
    kindBy = "ai";
    try {
      kind = await classifyDescription(description, "manual-sync");
    } catch (error) {
      return {
        error: `Couldn't read the description: ${
          error instanceof Error ? error.message : "AI request failed"
        }. Pick the kind of job yourself and try again.`,
      };
    }
  }

  const result = suggest({
    kind,
    coordinatorId,
    histories: await loadHistories(),
  });
  const query = await db.assignmentQuery.create({
    data: {
      userId: user.id,
      description,
      coordinatorId,
      kind,
      kindBy,
      result: result as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { queryId: query.id, kindBy, result };
}

export type ChoiceState = { error?: string; ok?: boolean };

/** What the floor manager actually decided, against the query it answered. */
export async function recordChoice(
  _prev: ChoiceState,
  formData: FormData,
): Promise<ChoiceState> {
  const user = await requireRole(...ASSIGN_ROLES);
  const queryId = formData.get("queryId");
  const personId = formData.get("personId");
  if (typeof queryId !== "string" || typeof personId !== "string" || !personId)
    return { error: "Pick a designer first." };
  const { count } = await db.assignmentQuery.updateMany({
    where: { id: queryId, userId: user.id },
    data: { chosenPersonId: personId, chosenAt: new Date() },
  });
  return count ? { ok: true } : { error: "That question isn't yours." };
}

// --- Labelling ---

export type LabelState = { error?: string; ok?: boolean };

/** Saves the signed-in coordinator's reading of every comment on a job. */
export async function saveLabels(
  _prev: LabelState,
  formData: FormData,
): Promise<LabelState> {
  const user = await requireRole(...ASSIGN_ROLES);
  const jobId = formData.get("jobId");
  if (typeof jobId !== "string") return { error: "Missing job" };
  const comments = await db.jobComment.findMany({
    where: { jobId },
    select: { id: true },
  });
  if (comments.length === 0) return { error: "Nothing to label" };

  for (const comment of comments) {
    const labels = normalizeCategories(formData.getAll(`labels:${comment.id}`));
    if (labels.length === 0) {
      // Untouched comment: clear any earlier reading rather than store "none".
      await db.commentLabel.deleteMany({
        where: { commentId: comment.id, userId: user.id },
      });
      continue;
    }
    await db.commentLabel.upsert({
      where: { commentId_userId: { commentId: comment.id, userId: user.id } },
      create: { commentId: comment.id, userId: user.id, labels },
      update: { labels },
    });
  }
  revalidatePath("/assign/labels");
  revalidatePath("/assign/eval");
  return { ok: true };
}

/** A person's fix of the AI's kind (also a training signal for later). */
export async function setJobKind(formData: FormData) {
  await requireRole(...ASSIGN_ROLES);
  const jobId = formData.get("jobId");
  const kind = formData.get("kind");
  if (typeof jobId !== "string" || !isJobKind(kind)) return;
  await db.job.update({ where: { id: jobId }, data: { kind, kindBy: "manual" } });
  revalidatePath(`/assign/labels/${jobId}`);
  revalidatePath("/assign/labels");
}

const HOLDOUT = 50;
const DEV = 40;

export type SampleState = { error?: string; ok?: string };

/**
 * Draws the labelling sample: jobs with comments that aren't in a set yet,
 * split train / dev / holdout (holdout locked first). HR only, and only
 * adds to what's there — nothing already drawn moves.
 */
export async function drawSample(
  _prev: SampleState,
  formData: FormData,
): Promise<SampleState> {
  await requireRole("HR_ADMIN");
  const size = Math.min(500, Math.max(10, Number(formData.get("size")) || 150));
  const [existing, candidates] = await Promise.all([
    db.job.groupBy({ by: ["evalSet"], where: { evalSet: { not: null } }, _count: { _all: true } }),
    db.job.findMany({
      where: { evalSet: null, comments: { some: {} } },
      select: { id: true },
    }),
  ]);
  const have = Object.fromEntries(
    existing.map((group) => [group.evalSet, group._count._all]),
  ) as Record<string, number>;
  if (candidates.length === 0) return { error: "No unlabelled jobs with comments to draw from." };
  const picked = splitSample(candidates, {
    holdout: Math.max(0, HOLDOUT - (have.holdout ?? 0)),
    dev: Math.max(0, DEV - (have.dev ?? 0)),
  });
  const trainWanted = Math.max(0, size - picked.holdout.length - picked.dev.length);
  const sets: [string, { id: string }[]][] = [
    ["holdout", picked.holdout],
    ["dev", picked.dev],
    ["train", picked.train.slice(0, trainWanted)],
  ];
  for (const [set, jobs] of sets) {
    if (jobs.length === 0) continue;
    await db.job.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { evalSet: set },
    });
  }
  revalidatePath("/assign/labels");
  return {
    ok: sets.map(([set, jobs]) => `${jobs.length} ${set}`).join(", ") + " drawn.",
  };
}

// --- Beliefs ---

export type BeliefState = { error?: string; ok?: boolean };

/** Writes the floor manager's beliefs down once; existing rows never change. */
export async function saveBeliefs(
  _prev: BeliefState,
  formData: FormData,
): Promise<BeliefState> {
  const user = await requireRole(...ASSIGN_ROLES);
  const designers = await listDesigners();
  const rows: { userId: string; personId: string; kind: string; level: string; note: string | null }[] = [];
  for (const designer of designers) {
    for (const kind of JOB_KINDS) {
      const level = formData.get(`belief:${designer.personId}:${kind}`);
      if (!isBeliefLevel(level) || level === "unknown") continue;
      const note = formData.get(`note:${designer.personId}:${kind}`);
      rows.push({
        userId: user.id,
        personId: designer.personId,
        kind,
        level,
        note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
      });
    }
  }
  if (rows.length === 0)
    return { error: `Mark at least one designer as ${BELIEF_LEVELS.slice(0, 3).join(" / ")}.` };
  await db.designerBelief.createMany({ data: rows, skipDuplicates: true });
  revalidatePath("/assign/beliefs");
  revalidatePath("/assign/eval");
  return { ok: true };
}

// --- Maintenance (HR) ---

export type ClassifyState = { error?: string; ok?: string };

/** Classifies what the sync left unread, inside one server action's budget. */
export async function classifyNow(): Promise<ClassifyState> {
  await requireRole("HR_ADMIN");
  try {
    const done = await classifyPending(240_000, "manual-sync");
    revalidatePath("/assign");
    return {
      ok:
        `Read ${done.jobs} jobs and ${done.comments} comments.` +
        (done.remaining.jobs || done.remaining.comments
          ? ` ${done.remaining.jobs} jobs and ${done.remaining.comments} comments still waiting — run again.`
          : " Everything is read."),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Classification failed" };
  }
}


export type RereadState = { error?: string; ok?: string };

/**
 * Clears the model's reading of every comment in the dev and holdout sets
 * so the next classification run reads them again with the current
 * coordinator examples. Without this the eval page keeps measuring the
 * prompt as it was before anyone labelled. HR only.
 */
export async function rereadEvalComments(): Promise<RereadState> {
  await requireRole("HR_ADMIN");
  const examples = await db.commentLabel.count({
    where: { comment: { job: { evalSet: "train" } } },
  });
  if (examples === 0)
    return { error: "Label some train-set comments first; there are no examples to learn from yet." };
  const { count } = await db.jobComment.updateMany({
    where: { job: { evalSet: { in: ["dev", "holdout"] } } },
    data: { aiLabels: [], aiLabelledAt: null },
  });
  revalidatePath("/assign/eval");
  revalidatePath("/assign");
  return {
    ok: `${count} dev and holdout comments will be read again with ${examples} labelled examples. Run "Read new jobs & comments" on the Assign page.`,
  };
}
