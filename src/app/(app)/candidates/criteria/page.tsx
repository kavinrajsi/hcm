import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { roleKey } from "@/lib/candidates/score-bands";
import { NOT_SPAM } from "../query";
import { CriteriaForm } from "./criteria-form";

export const metadata = { title: "Role criteria" };

// What HR looks for in each job role people apply for. Resume scores for
// that role are judged against it (src/lib/candidates/score.ts).
export default async function RoleCriteriaPage() {
  await requirePageRole("HR_ADMIN");
  const [groups, saved] = await Promise.all([
    db.candidate.groupBy({
      by: ["jobRole"],
      where: { AND: [NOT_SPAM, { jobRole: { not: null } }] },
      _count: true,
    }),
    db.roleCriteria.findMany({ select: { roleKey: true, role: true, criteria: true } }),
  ]);

  // One entry per role, case-insensitively merged, most applications first.
  const roles = new Map<string, { role: string; count: number }>();
  for (const group of groups) {
    const role = group.jobRole?.trim();
    if (!role) continue;
    const entry = roles.get(roleKey(role));
    if (entry) entry.count += group._count;
    else roles.set(roleKey(role), { role, count: group._count });
  }
  for (const row of saved) if (!roles.has(row.roleKey)) roles.set(row.roleKey, { role: row.role, count: 0 });
  const criteriaByRole = new Map(saved.map((row) => [row.roleKey, row.criteria]));
  const list = [...roles.entries()].sort((left, right) => right[1].count - left[1].count);
  const withCriteria = list.filter(([key]) => criteriaByRole.has(key)).length;

  return (
    <PageShell width="md">
      <Link href="/candidates" className="text-sm text-zinc-500 hover:text-foreground">
        ← Candidates
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">Role criteria</h1>
      <p className="mt-1 text-sm text-zinc-500">
        What you look for in each job role. Resume scores are judged against it; without criteria a role is scored on
        general expectations. {withCriteria} of {list.length} roles have criteria.
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {list.map(([key, { role, count }]) => (
          <li key={key} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{role}</h2>
              <span className="text-xs text-zinc-500">
                {count} application{count === 1 ? "" : "s"}
                {criteriaByRole.has(key) ? " · has criteria" : ""}
              </span>
            </div>
            <CriteriaForm role={role} criteria={criteriaByRole.get(key) ?? ""} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
