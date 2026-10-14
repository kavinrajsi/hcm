import Link from "next/link";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import type { BuiltinData } from "@/lib/dashboard/builtins";
import type { RecruitmentStats } from "@/lib/recruitment-stats";

// Dashboard: the built-in widgets with their own layout — recruitment from
// the madarth.com career form (HR) and upcoming birthdays/anniversaries.

const TOP_ROLES = 5;

function RecruitmentTrend({ stats }: { stats: RecruitmentStats }) {
  const { months, roles } = stats;
  const labels = months.map((month) => month.label);
  // Top roles get the categorical slots in order; the rest fold into Other.
  const series: LineSeries[] = roles.slice(0, TOP_ROLES).map((roleRow, index) => ({
    key: roleRow.role,
    label: roleRow.role,
    color: `var(--viz-series-${index + 1})`,
    values: roleRow.byMonth,
  }));
  const rest = roles.slice(TOP_ROLES);
  if (rest.length > 0) {
    series.push({
      key: "__other",
      label: `Other (${rest.length} roles)`,
      color: "var(--viz-other)",
      values: months.map((_, monthIndex) => rest.reduce((sum, roleRow) => sum + roleRow.byMonth[monthIndex], 0)),
    });
  }
  if (months.length === 0) return <p className="text-sm text-zinc-500">No applications yet.</p>;
  return (
    <div className="viz-root">
      <LineChart
        labels={labels}
        series={series}
        ariaLabel={`Applications per month by role, ${labels[0]} to ${labels.at(-1)}.`}
      />
    </div>
  );
}

function RecruitmentPipeline({ stats }: { stats: RecruitmentStats }) {
  const { pipeline, rejected, total } = stats;
  const pipelineMax = Math.max(1, ...pipeline.map((stage) => stage.count));
  return (
    <>
      <ul className="viz-root flex flex-col gap-3">
        {pipeline.map((stage) => (
          <li key={stage.stage}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{stage.stage}</span>
              <span className="font-semibold tabular-nums">
                {stage.count.toLocaleString("en-IN")}
                <span className="ml-1.5 text-xs font-normal text-zinc-500">
                  {total ? Math.round((stage.count / total) * 100) : 0}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.max(1, (stage.count / pipelineMax) * 100)}%`, background: "var(--viz-bar)" }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-zinc-200 pt-3 text-sm text-zinc-500 dark:border-zinc-800">
        Rejected <span className="font-semibold text-foreground tabular-nums">{rejected.toLocaleString("en-IN")}</span> ·{" "}
        {total.toLocaleString("en-IN")} applications in total
      </p>
    </>
  );
}

function RecruitmentTable({ stats }: { stats: RecruitmentStats }) {
  const { months, roles, monthTotals, total } = stats;
  const cell = "border-t border-zinc-200 px-3 py-2 dark:border-zinc-800";
  const totalCell = "border-t-2 border-zinc-300 px-3 py-2 dark:border-zinc-700";
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="sticky left-0 z-10 bg-background px-4 py-2 font-medium md:px-5">Role</th>
            <th className="px-3 py-2 text-right font-medium">Total Job Postings</th>
            <th className="px-3 py-2 font-medium">Position Breakdown</th>
            {months.map((month) => (
              <th key={month.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {month.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((roleRow) => (
            <tr key={roleRow.role}>
              <td className={`sticky left-0 z-10 bg-background font-medium whitespace-nowrap md:px-5 ${cell} px-4`}>
                <Link href={`/candidates?role=${encodeURIComponent(roleRow.role)}`} className="hover:underline">
                  {roleRow.role}
                </Link>
              </td>
              <td className={`${cell} text-right font-semibold tabular-nums`}>{roleRow.total}</td>
              <td className={`${cell} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>
                {roleRow.fullTime} Full time · {roleRow.intern} Intern
              </td>
              {roleRow.byMonth.map((count, index) => (
                <td key={months[index].key} className={`${cell} text-right tabular-nums`}>
                  {count || <span className="text-zinc-300 dark:text-zinc-700">–</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={`sticky left-0 z-10 bg-background px-4 md:px-5 ${totalCell}`}>Total</td>
            <td className={`${totalCell} text-right tabular-nums`}>{total}</td>
            <td className={`${totalCell} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>
              {roles.reduce((sum, roleRow) => sum + roleRow.fullTime, 0)} Full time ·{" "}
              {roles.reduce((sum, roleRow) => sum + roleRow.intern, 0)} Intern
            </td>
            {monthTotals.map((count, index) => (
              <td key={months[index].key} className={`${totalCell} text-right tabular-nums`}>
                {count}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BuiltinView({ data }: { data: BuiltinData | undefined }) {
  if (!data || "denied" in data) return <p className="text-sm text-zinc-500">Not available for your role.</p>;
  switch (data.key) {
    case "recruitment-trend":
      return <RecruitmentTrend stats={data.stats} />;
    case "recruitment-pipeline":
      return <RecruitmentPipeline stats={data.stats} />;
    case "recruitment-table":
      return <RecruitmentTable stats={data.stats} />;
    case "celebrations":
      return data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing in the next 30 days.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {data.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2.5 py-2">
              <EmployeeAvatar name={item.name} avatarKey={item.avatarKey} className="size-7 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block text-xs text-zinc-500">{item.what}</span>
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{item.when}</span>
            </li>
          ))}
        </ul>
      );
  }
}

/** Where a built-in's title links to. */
export const BUILTIN_LINKS: Record<string, string> = {
  "recruitment-trend": "/candidates",
  "recruitment-pipeline": "/candidates",
  "recruitment-table": "/candidates",
  celebrations: "/birthdays",
};
