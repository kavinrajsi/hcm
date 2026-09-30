import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { listDesigners } from "@/lib/assign/data";
import {
  BELIEF_LEVEL_LABELS,
  JOB_KIND_LABELS,
  isBeliefLevel,
  isJobKind,
} from "@/lib/assign/taxonomy";
import { formatDateTime } from "@/lib/format-date";
import { PageHeader, PageShell } from "@/components/page";
import { AssignTabs } from "../tabs";
import { BeliefsForm } from "./beliefs-form";

export const metadata = { title: "Beliefs" };

export default async function BeliefsPage() {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const [designers, beliefs] = await Promise.all([
    listDesigners(),
    db.designerBelief.findMany({
      where: { userId: user.id },
      orderBy: [{ personId: "asc" }, { kind: "asc" }],
    }),
  ]);
  const byPerson = new Map(designers.map((designer) => [designer.personId, designer]));

  return (
    <PageShell width="md">
      <PageHeader
        title="What you believe about each designer"
        description="Written down before seeing any suggestion, so the record can be checked against a prediction rather than a memory."
      />
      <div className="mt-4">
        <AssignTabs current="beliefs" />
      </div>

      <div className="mt-6">
        {designers.length === 0 ? (
          <p className="text-sm text-zinc-500">No designers on record yet — sync jobs from Basecamp first.</p>
        ) : beliefs.length > 0 ? (
          <>
            <p className="text-sm text-zinc-500">
              Written down on {formatDateTime(beliefs[0].createdAt)}. Compared with the record on the
              &ldquo;How well it reads&rdquo; tab.
            </p>
            <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {beliefs.map((belief) => (
                <li key={belief.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    <span className="font-medium">{byPerson.get(belief.personId)?.name ?? belief.personId}</span>
                    <span className="text-zinc-500"> · {isJobKind(belief.kind) ? JOB_KIND_LABELS[belief.kind] : belief.kind}</span>
                  </span>
                  <span>{isBeliefLevel(belief.level) ? BELIEF_LEVEL_LABELS[belief.level] : belief.level}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <BeliefsForm designers={designers} />
        )}
      </div>
    </PageShell>
  );
}
