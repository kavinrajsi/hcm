import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { listCoordinators, listDesigners } from "@/lib/assign/data";
import { PageHeader, PageShell } from "@/components/page";
import { AssignTabs } from "./tabs";
import { JobsSyncButton } from "./jobs-sync";
import { ClassifyButton, SuggestForm } from "./suggest-form";

export const metadata = { title: "Assign" };

// classifyNow runs through a server action on this page.
export const maxDuration = 300;

export default async function AssignPage() {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const [designers, coordinators, jobs, unread, comments, unreadComments] =
    await Promise.all([
      listDesigners(),
      listCoordinators(),
      db.job.count(),
      db.job.count({ where: { kind: null } }),
      db.jobComment.count(),
      db.jobComment.count({ where: { aiLabelledAt: null } }),
    ]);
  const isHr = user.role === "HR_ADMIN";

  return (
    <PageShell width="md">
      <PageHeader
        title="Who should take this?"
        description="What the record says about designers on similar past jobs. A choice with evidence, not a ranking."
        actions={isHr ? <JobsSyncButton /> : undefined}
      />
      <div className="mt-4">
        <AssignTabs current="suggest" />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        {jobs.toLocaleString("en-IN")} completed jobs, {comments.toLocaleString("en-IN")} comments on record
        {unread || unreadComments
          ? ` · ${unread} jobs and ${unreadComments} comments not yet read`
          : ""}
        .
      </p>
      {isHr && (unread > 0 || unreadComments > 0) && (
        <div className="mt-2">
          <ClassifyButton />
        </div>
      )}

      <div className="mt-6">
        {jobs === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
            No jobs yet. {isHr ? "Sync jobs from Basecamp to start." : "Ask HR to sync jobs from Basecamp."}
          </p>
        ) : (
          <SuggestForm coordinators={coordinators} designers={designers} />
        )}
      </div>
    </PageShell>
  );
}
