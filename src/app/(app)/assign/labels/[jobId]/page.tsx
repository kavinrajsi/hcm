import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { commentRole } from "@/lib/assign/classify";
import { JOB_KINDS, JOB_KIND_LABELS, isJobKind } from "@/lib/assign/taxonomy";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowOutwardIcon } from "@/components/icons";
import { PageHeader, PageShell } from "@/components/page";
import { setJobKind } from "../../actions";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField } from "@/components/form/form-field";
import { LabelForm, type CommentToLabel } from "./label-form";
import { sharedJobIds } from "@/lib/assign/shared";

export const metadata = { title: "Label comments" };

const selectClass =
  "h-10 rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export default async function LabelJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const { jobId } = await params;
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      description: true,
      bucketName: true,
      link: true,
      kind: true,
      kindBy: true,
      evalSet: true,
      creatorName: true,
      creatorPersonId: true,
      completedAt: true,
      assignees: { select: { personId: true, name: true } },
      comments: {
        orderBy: { postedAt: "asc" },
        select: {
          id: true,
          authorName: true,
          authorPersonId: true,
          postedAt: true,
          content: true,
          link: true,
          labels: { where: { userId: user.id }, select: { labels: true } },
        },
      },
    },
  });
  if (!job) notFound();

  // Next job in the same set that still has a comment you haven't read.
  // Shared jobs come first: until you've done them all, "next" is one of them.
  const sharedIds = await sharedJobIds();
  const isShared = sharedIds.includes(job.id);
  const unlabelledByMe = { comments: { some: { labels: { none: { userId: user.id } } } } };
  const next =
    (await db.job.findFirst({
      where: { id: { in: sharedIds, not: job.id }, ...unlabelledByMe },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    })) ??
    (await db.job.findFirst({
      where: { evalSet: job.evalSet, id: { not: job.id }, ...unlabelledByMe },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    }));

  const comments: CommentToLabel[] = job.comments.map((comment) => ({
    id: comment.id,
    authorName: comment.authorName,
    role: commentRole(comment.authorPersonId, job),
    postedAt: formatDateTime(comment.postedAt),
    content: comment.content,
    link: comment.link,
    mine: comment.labels[0]?.labels ?? [],
  }));

  return (
    <PageShell width="md">
      <PageHeader
        title={job.title}
        description={
          <>
            {job.bucketName} · raised by {job.creatorName} · done by{" "}
            {job.assignees.map((assignee) => assignee.name).join(", ") || "nobody assigned"}
            {" · "}
            <a href={job.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              Open in Basecamp <ArrowOutwardIcon className="size-3.5" />
            </a>
          </>
        }
        actions={
          <>
            {isShared && <Badge>Both</Badge>}
            <Badge variant="outline">{job.evalSet ?? "not in sample"}</Badge>
            <Button variant="outline" nativeButton={false} render={<Link href="/assign/labels" />}>
              All jobs
            </Button>
            {next && (
              <Button nativeButton={false} render={<Link href={`/assign/labels/${next.id}`} />}>
                Next unlabelled
              </Button>
            )}
          </>
        }
      />

      {isShared && (
        <p className="mt-4 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          Both coordinators label this job, separately. Don&rsquo;t compare notes until you&rsquo;ve
          both finished the shared set.
        </p>
      )}

      {job.description && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
          {job.description}
        </p>
      )}

      <ValidatedForm action={setJobKind} className="mt-4 flex flex-wrap items-start gap-2 text-sm">
        <input type="hidden" name="jobId" value={job.id} />
        <label htmlFor="kind" className="leading-9 font-medium">
          Kind of job
        </label>
        <FormField name="kind">
          <select
            id="kind"
            name="kind"
            required
            defaultValue={isJobKind(job.kind) ? job.kind : ""}
            className={selectClass}
          >
            <option value="" disabled>
              Not read yet
            </option>
            {JOB_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {JOB_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </FormField>
        <Button type="submit" variant="outline" size="sm">
          Fix kind
        </Button>
        <span className="text-xs leading-9 text-zinc-500">
          {job.kindBy === "manual" ? "set by a person" : job.kindBy === "ai" ? "read by the model" : ""}
        </span>
      </ValidatedForm>

      <div className="mt-6">
        {comments.length === 0 ? (
          <p className="text-sm text-zinc-500">This job has no comments.</p>
        ) : (
          <LabelForm jobId={job.id} comments={comments} />
        )}
      </div>
    </PageShell>
  );
}
