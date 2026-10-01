import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { loadHistories } from "@/lib/assign/data";
import {
  categoryAgreement,
  categoryMetrics,
  describeKappa,
  effectiveLabels,
} from "@/lib/assign/eval";
import { buildEvidence, describeRecord, type SuggestionResult } from "@/lib/assign/suggest";
import {
  BELIEF_LEVEL_LABELS,
  COMMENT_CATEGORY_LABELS,
  JOB_KIND_LABELS,
  isBeliefLevel,
  isJobKind,
} from "@/lib/assign/taxonomy";
import { PageHeader, PageShell } from "@/components/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssignTabs } from "../tabs";
import { RereadButton } from "./reread-button";

export const metadata = { title: "How well it reads" };

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const num = (value: number | null) => (value === null ? "—" : value.toFixed(2));

export default async function EvalPage({
  searchParams,
}: {
  searchParams: Promise<{ holdout?: string }>;
}) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const revealHoldout = user.role === "HR_ADMIN" && (await searchParams).holdout === "1";

  const [sample, labellers, labelled, beliefs, queries] = await Promise.all([
    db.job.groupBy({ by: ["evalSet"], where: { evalSet: { not: null } }, _count: { _all: true } }),
    db.commentLabel.groupBy({ by: ["userId"], _count: { _all: true } }),
    // Every labelled comment in the sample, with the model's reading.
    db.jobComment.findMany({
      where: { labels: { some: {} }, job: { evalSet: { not: null } } },
      select: {
        id: true,
        aiLabels: true,
        aiLabelledAt: true,
        job: { select: { evalSet: true } },
        labels: { select: { userId: true, labels: true } },
      },
    }),
    db.designerBelief.findMany({ where: { userId: user.id } }),
    db.assignmentQuery.findMany({
      select: { result: true, chosenPersonId: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: labellers.map((row) => row.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userName = (id: string) => {
    const found = users.find((row) => row.id === id);
    return found?.name || found?.email || "someone";
  };

  // Agreement: the two labellers who share the most comments.
  const shared = new Map<string, { a: string; b: string; pairs: { a: string[]; b: string[] }[] }>();
  for (const comment of labelled) {
    const byUser = comment.labels;
    for (let i = 0; i < byUser.length; i++)
      for (let j = i + 1; j < byUser.length; j++) {
        const [first, second] = [byUser[i], byUser[j]].sort((x, y) => x.userId.localeCompare(y.userId));
        const key = `${first.userId}|${second.userId}`;
        const entry = shared.get(key) ?? { a: first.userId, b: second.userId, pairs: [] };
        entry.pairs.push({ a: first.labels, b: second.labels });
        shared.set(key, entry);
      }
  }
  const agreementPair = [...shared.values()].sort((x, y) => y.pairs.length - x.pairs.length)[0];

  // Model vs coordinators, per set.
  const setsToScore = ["dev", ...(revealHoldout ? ["holdout"] : [])];
  const scores = setsToScore.map((set) => {
    const pairs = labelled
      .filter((comment) => comment.job.evalSet === set && comment.aiLabelledAt)
      .map((comment) => ({
        predicted: comment.aiLabels,
        truth: effectiveLabels(comment.labels.map((label) => label.labels), []).labels,
      }));
    return { set, n: pairs.length, metrics: categoryMetrics(pairs) };
  });

  // Beliefs vs the record (all coordinators).
  const histories = beliefs.length ? await loadHistories() : [];
  const beliefRows = beliefs.map((belief) => {
    const history = histories.find((row) => row.designer.personId === belief.personId);
    const evidence = history ? buildEvidence(history, belief.kind, null) : null;
    return { belief, name: history?.designer.name ?? belief.personId, evidence };
  });

  // What the floor manager did with the answers.
  const outcomes = { total: queries.length, chosen: 0, safe: 0, learning: 0, other: 0, noHistory: 0 };
  for (const query of queries) {
    const result = query.result as unknown as SuggestionResult;
    if (result.status === "no-history") outcomes.noHistory++;
    if (!query.chosenPersonId) continue;
    outcomes.chosen++;
    if (result.safe?.designer.personId === query.chosenPersonId) outcomes.safe++;
    else if (result.learning?.designer.personId === query.chosenPersonId) outcomes.learning++;
    else outcomes.other++;
  }

  return (
    <PageShell width="md">
      <PageHeader
        title="How well it reads"
        description="Measured, not assumed: how much the coordinators agree with each other, how the model does against them, and how the record compares with what was believed."
      />
      <div className="mt-4">
        <AssignTabs current="eval" />
      </div>

      <Section title="The sample">
        <p className="text-sm">
          {sample.length === 0
            ? "No labelling sample drawn yet."
            : sample.map((row) => `${row._count._all} ${row.evalSet}`).join(" · ")}
          {labellers.length > 0 && (
            <>
              {" — labels so far: "}
              {labellers.map((row) => `${userName(row.userId)} ${row._count._all}`).join(", ")}.
            </>
          )}
        </p>
      </Section>

      <Section title="Do the coordinators agree with each other?">
        {agreementPair ? (
          <>
            <p className="text-sm">
              {userName(agreementPair.a)} and {userName(agreementPair.b)} have both read{" "}
              {agreementPair.pairs.length} comments. Kappa below 0.4 on a category means the
              category itself is unclear and needs fixing before anything is built on it.
            </p>
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Agree</TableHead>
                  <TableHead className="text-right">Kappa</TableHead>
                  <TableHead>Reading</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryAgreement(agreementPair.pairs).map((row) => (
                  <TableRow key={row.category}>
                    <TableCell>{COMMENT_CATEGORY_LABELS[row.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.agreePercent}%</TableCell>
                    <TableCell className="text-right tabular-nums">{num(row.kappa)}</TableCell>
                    <TableCell className="text-zinc-500">{describeKappa(row.kappa)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Needs two people to label the same comments. Both coordinators should read the same
            30 threads separately.
          </p>
        )}
      </Section>

      <Section title="Does the model read like the coordinators?">
        {scores.map((score) => (
          <div key={score.set} className="mb-4">
            <h3 className="text-sm font-medium">
              {score.set === "dev" ? "Dev set" : "Holdout set (locked)"} · {score.n} labelled comments
            </h3>
            {score.n === 0 ? (
              <p className="mt-1 text-sm text-zinc-500">Nothing labelled and read in this set yet.</p>
            ) : (
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Support</TableHead>
                    <TableHead className="text-right">Precision</TableHead>
                    <TableHead className="text-right">Recall</TableHead>
                    <TableHead className="text-right">F1</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {score.metrics.map((row) => (
                    <TableRow key={row.category} className={row.category === "CORRECTION" ? "font-medium" : ""}>
                      <TableCell>{COMMENT_CATEGORY_LABELS[row.category]}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.support}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.precision)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.recall)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.f1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ))}
        <p className="text-xs text-zinc-500">
          Correction is the category that matters: a miss there turns a client&rsquo;s change of
          mind into a designer&rsquo;s mistake.
          {user.role === "HR_ADMIN" && !revealHoldout && (
            <>
              {" "}
              The holdout set stays hidden until the end.{" "}
              <Link href="/assign/eval?holdout=1" className="underline">
                Open it
              </Link>{" "}
              only once the prompt and categories are final.
            </>
          )}
        </p>
        {user.role === "HR_ADMIN" && (
          <>
            <p className="mt-3 text-xs text-zinc-500">
              The model learns from train-set labels, but comments it has already read aren&rsquo;t
              read again. After coordinators label more of the train set, clear the dev and holdout
              readings so the scores above reflect the current prompt.
            </p>
            <RereadButton />
          </>
        )}
      </Section>

      <Section title="What you believed vs. the record">
        {beliefRows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No beliefs written down yet — do that on the Beliefs tab before looking at suggestions.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Designer</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>You believed</TableHead>
                <TableHead>The record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {beliefRows.map(({ belief, name, evidence }) => (
                <TableRow key={belief.id}>
                  <TableCell>{name}</TableCell>
                  <TableCell>{isJobKind(belief.kind) ? JOB_KIND_LABELS[belief.kind] : belief.kind}</TableCell>
                  <TableCell>{isBeliefLevel(belief.level) ? BELIEF_LEVEL_LABELS[belief.level] : belief.level}</TableCell>
                  <TableCell className="text-zinc-500">
                    {evidence ? describeRecord(evidence) : "no record"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="What happened to the suggestions">
        <p className="text-sm">
          {outcomes.total === 0
            ? "No questions asked yet."
            : `${outcomes.total} asked, ${outcomes.noHistory} answered “not enough history”, ${outcomes.chosen} with a recorded choice: ` +
              `${outcomes.safe} took the safe pick, ${outcomes.learning} the learning pick, ${outcomes.other} someone else.`}
        </p>
      </Section>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
