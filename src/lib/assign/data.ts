import { db } from "@/lib/db";
import { effectiveLabels } from "@/lib/assign/eval";
import { isDesignerTitle } from "@/lib/assign/taxonomy";
import type { DesignerHistory, DesignerRef } from "@/lib/assign/suggest";

// Database side of Assignment Intelligence: who the designers and
// coordinators are (from the jobs themselves) and each designer's record.

/**
 * Everyone ever assigned a job whose Basecamp title says designer. Falls
 * back to every assignee when titles aren't filled in.
 */
export async function listDesigners(): Promise<DesignerRef[]> {
  const rows = await db.jobAssignee.findMany({
    distinct: ["personId"],
    orderBy: { name: "asc" },
    select: {
      personId: true,
      name: true,
      title: true,
      employee: { select: { avatarBlobKey: true } },
    },
  });
  const designers = rows.filter((row) => isDesignerTitle(row.title));
  return (designers.length ? designers : rows).map((row) => ({
    personId: row.personId,
    name: row.name,
    title: row.title,
    avatarKey: row.employee?.avatarBlobKey ?? null,
  }));
}

/**
 * Who can be picked as the Client Coordinator: current employees with one
 * of these designations. Matched case-insensitively.
 */
export const COORDINATOR_DESIGNATIONS = [
  "CGP",
  "IT Head",
  "HCM",
  "Delivery Manager",
  "CFO",
  "Founder",
  "Co-Founder",
  "Marketing Manager",
];

export type CoordinatorOption = {
  /** Basecamp person id (what jobs record as their creator); null = not linked. */
  personId: string | null;
  name: string;
  designation: string;
  jobs: number;
};

/**
 * Client Coordinators = current employees with a coordinator designation,
 * most jobs raised first. Someone with no Basecamp link has no history to
 * compare under, so the form shows them but can't pick them.
 */
export async function listCoordinators(): Promise<CoordinatorOption[]> {
  const employees = await db.employee.findMany({
    where: {
      dateOfExit: null,
      OR: COORDINATOR_DESIGNATIONS.map((designation) => ({
        designation: { equals: designation, mode: "insensitive" as const },
      })),
    },
    select: { name: true, designation: true, basecampPersonId: true },
  });
  const linked = employees
    .map((employee) => employee.basecampPersonId)
    .filter((id): id is string => !!id);
  const counts = linked.length
    ? await db.job.groupBy({
        by: ["creatorPersonId"],
        where: { creatorPersonId: { in: linked } },
        _count: { _all: true },
      })
    : [];
  const jobsBy = new Map(counts.map((row) => [row.creatorPersonId, row._count._all]));
  return employees
    .map((employee) => ({
      personId: employee.basecampPersonId,
      name: employee.name,
      designation: employee.designation,
      jobs: employee.basecampPersonId ? (jobsBy.get(employee.basecampPersonId) ?? 0) : 0,
    }))
    .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
}

/** Every classified job, with its corrections counted, per designer. */
export async function loadHistories(): Promise<DesignerHistory[]> {
  const designers = await listDesigners();
  const designerIds = new Set(designers.map((designer) => designer.personId));
  const jobs = await db.job.findMany({
    where: { kind: { not: null } },
    select: {
      id: true,
      title: true,
      link: true,
      bucketName: true,
      completedAt: true,
      kind: true,
      creatorPersonId: true,
      creatorName: true,
      assignees: { select: { personId: true } },
      comments: {
        select: {
          aiLabels: true,
          labels: { select: { labels: true } },
        },
      },
    },
  });
  const byDesigner = new Map<string, DesignerHistory>(
    designers.map((designer) => [designer.personId, { designer, jobs: [] }]),
  );
  for (const job of jobs) {
    let corrections = 0;
    let source: "manual" | "ai" | "none" = "none";
    let unread = false;
    for (const comment of job.comments) {
      const read = effectiveLabels(
        comment.labels.map((label) => label.labels),
        comment.aiLabels,
      );
      if (read.source === "none") unread = true;
      if (read.labels.includes("CORRECTION")) corrections++;
      if (read.source === "manual") source = "manual";
      else if (read.source === "ai" && source === "none") source = "ai";
    }
    // A comment nobody has read yet could be a correction; counting the job
    // as clean would overstate the record, so leave it out until it's read.
    if (unread) continue;
    const evidence = {
      id: job.id,
      title: job.title,
      link: job.link,
      bucketName: job.bucketName,
      completedAt: job.completedAt.toISOString(),
      kind: job.kind!,
      coordinatorId: job.creatorPersonId,
      coordinatorName: job.creatorName,
      corrections,
      labelSource: source,
    };
    for (const assignee of job.assignees) {
      if (!designerIds.has(assignee.personId)) continue;
      byDesigner.get(assignee.personId)!.jobs.push(evidence);
    }
  }
  return [...byDesigner.values()];
}
