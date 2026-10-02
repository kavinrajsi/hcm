import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { JOB_KIND_LABELS, isJobKind } from "@/lib/assign/taxonomy";
import { Badge } from "@/components/ui/badge";
import { ListCard } from "@/components/list-card";
import { Segmented } from "@/components/segmented";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssignTabs } from "../tabs";
import { SampleForm } from "./sample-form";

export const metadata = { title: "Label comments" };

const SETS = ["all", "train", "dev", "holdout"] as const;
type SetFilter = (typeof SETS)[number];
const SET_LABELS: Record<SetFilter, string> = {
  all: "All",
  train: "Train",
  dev: "Dev",
  holdout: "Holdout",
};

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const params = await searchParams;
  const set: SetFilter = (SETS as readonly string[]).includes(params.set ?? "")
    ? (params.set as SetFilter)
    : "all";

  const [drawn, jobs] = await Promise.all([
    db.job.count({ where: { evalSet: { not: null } } }),
    db.job.findMany({
      where: set === "all" ? { evalSet: { not: null } } : { evalSet: set },
      orderBy: [{ evalSet: "asc" }, { completedAt: "desc" }],
      select: {
        id: true,
        title: true,
        bucketName: true,
        kind: true,
        evalSet: true,
        completedAt: true,
        comments: {
          select: {
            id: true,
            labels: { where: { userId: user.id }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const rows = jobs.map((job) => ({
    ...job,
    total: job.comments.length,
    mine: job.comments.filter((comment) => comment.labels.length > 0).length,
  }));
  const finished = rows.filter((row) => row.total > 0 && row.mine === row.total).length;

  return (
    <PageShell width="md">
      <PageHeader
        title="Label comments"
        description="Read each comment on a job and say what it's doing. Your reading is what the model is measured against, so don't look at what it guessed."
      />
      <div className="mt-4">
        <AssignTabs current="labels" />
      </div>

      {user.role === "HR_ADMIN" && (
        <div className="mt-4">
          <SampleForm drawn={drawn} />
        </div>
      )}

      {drawn > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Sample set"
              items={SETS.map((value) => ({
                key: value,
                href: value === "all" ? "/assign/labels" : `/assign/labels?set=${value}`,
                label: SET_LABELS[value],
                active: set === value,
              }))}
            />
            <p className="text-sm text-zinc-500">
              You&rsquo;ve finished {finished} of {rows.length}.
            </p>
          </div>

          <div className="mt-4">
            <DesktopTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead className="text-right">Your labels</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/assign/labels/${row.id}`} className="font-medium hover:underline">
                          {row.title}
                        </Link>
                        <p className="text-xs text-zinc-500">{row.bucketName}</p>
                      </TableCell>
                      <TableCell>{isJobKind(row.kind) ? JOB_KIND_LABELS[row.kind] : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.evalSet}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Progress mine={row.mine} total={row.total} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
            <MobileList empty="No jobs in this set." isEmpty={rows.length === 0}>
              {rows.map((row) => (
                <ListCard
                  key={row.id}
                  href={`/assign/labels/${row.id}`}
                  title={row.title}
                  subtitle={row.bucketName}
                  badge={<Badge variant="outline">{row.evalSet}</Badge>}
                  meta={
                    <>
                      <span>{isJobKind(row.kind) ? JOB_KIND_LABELS[row.kind] : "—"}</span>
                      <Progress mine={row.mine} total={row.total} />
                    </>
                  }
                />
              ))}
            </MobileList>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Progress({ mine, total }: { mine: number; total: number }) {
  const done = total > 0 && mine === total;
  return (
    <span className={done ? "text-emerald-600 dark:text-emerald-400" : mine ? "text-amber-600" : "text-zinc-500"}>
      {mine} / {total}
    </span>
  );
}
