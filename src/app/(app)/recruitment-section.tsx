import Link from "next/link";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import type { RecruitmentStats } from "@/lib/recruitment-stats";

// Dashboard (HR admins): applications from the madarth.com career form —
// the trend by role, where candidates sit in the pipeline, and the full
// role × month table (which is also the chart's table view).

const TOP_ROLES = 5;

function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-zinc-200 p-4 md:p-5 dark:border-zinc-800 ${className}`}
    >
      <h3 className="font-medium">{title}</h3>
      <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RecruitmentSection({ stats }: { stats: RecruitmentStats }) {
  const { months, roles, monthTotals, pipeline, rejected, total } = stats;
  const labels = months.map((month) => month.label);

  // Top roles get the categorical slots in order; the rest fold into Other.
  const series: LineSeries[] = roles
    .slice(0, TOP_ROLES)
    .map((roleRow, index) => ({
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
      values: months.map((_, monthIndex) =>
        rest.reduce((sum, roleRow) => sum + roleRow.byMonth[monthIndex], 0),
      ),
    });
  }

  const pipelineMax = Math.max(
    1,
    ...pipeline.map((pipelineStage) => pipelineStage.count),
  );

  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Recruitment</h2>
        <Link
          href="/candidates"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          Candidates →
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Job Postings by Role"
          subtitle="Trend of job postings across different roles"
          className="lg:col-span-2"
        >
          {months.length === 0 ? (
            <p className="text-sm text-zinc-500">No applications yet.</p>
          ) : (
            <LineChart
              labels={labels}
              series={series}
              ariaLabel={`Applications per month by role, ${labels[0]} to ${labels.at(-1)}. Full numbers in the table below.`}
            />
          )}
        </Card>

        <Card
          title="Recruitment Pipeline"
          subtitle="Candidates at each stage right now"
        >
          <ul className="viz-root flex flex-col gap-3">
            {pipeline.map((pipelineStage) => (
              <li key={pipelineStage.stage}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{pipelineStage.stage}</span>
                  <span className="font-semibold tabular-nums">
                    {pipelineStage.count.toLocaleString("en-IN")}
                    <span className="ml-1.5 text-xs font-normal text-zinc-500">
                      {total
                        ? Math.round((pipelineStage.count / total) * 100)
                        : 0}
                      %
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.max(1, (pipelineStage.count / pipelineMax) * 100)}%`,
                      background: "var(--viz-bar)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-zinc-200 pt-3 text-sm text-zinc-500 dark:border-zinc-800">
            Rejected{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rejected.toLocaleString("en-IN")}
            </span>{" "}
            · {total.toLocaleString("en-IN")} applications in total
          </p>
        </Card>
      </div>

      <Card
        title="Job Postings by Role"
        subtitle="Applications per role each month, with the Full time / Intern split"
        className="mt-4"
      >
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="sticky left-0 z-10 bg-background px-4 py-2 font-medium md:px-5">
                  Role
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Total Job Postings
                </th>
                <th className="px-3 py-2 font-medium">Position Breakdown</th>
                {months.map((month) => (
                  <th
                    key={month.key}
                    className="px-3 py-2 text-right font-medium whitespace-nowrap"
                  >
                    {month.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((roleRow) => (
                <tr key={roleRow.role} className="border-t">
                  <td className="sticky left-0 z-10 border-t border-zinc-200 bg-background px-4 py-2 font-medium whitespace-nowrap md:px-5 dark:border-zinc-800">
                    {roleRow.role}
                  </td>
                  <td className="border-t border-zinc-200 px-3 py-2 text-right font-semibold tabular-nums dark:border-zinc-800">
                    {roleRow.total}
                  </td>
                  <td className="border-t border-zinc-200 px-3 py-2 whitespace-nowrap text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    {roleRow.fullTime} Full time · {roleRow.intern} Intern
                  </td>
                  {roleRow.byMonth.map((count, index) => (
                    <td
                      key={months[index].key}
                      className="border-t border-zinc-200 px-3 py-2 text-right tabular-nums dark:border-zinc-800"
                    >
                      {count || (
                        <span className="text-zinc-300 dark:text-zinc-700">
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 border-t-2 border-zinc-300 bg-background px-4 py-2 md:px-5 dark:border-zinc-700">
                  Total
                </td>
                <td className="border-t-2 border-zinc-300 px-3 py-2 text-right tabular-nums dark:border-zinc-700">
                  {total}
                </td>
                <td className="border-t-2 border-zinc-300 px-3 py-2 whitespace-nowrap text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  {roles.reduce((sum, roleRow) => sum + roleRow.fullTime, 0)}{" "}
                  Full time ·{" "}
                  {roles.reduce((sum, roleRow) => sum + roleRow.intern, 0)}{" "}
                  Intern
                </td>
                {monthTotals.map((count, index) => (
                  <td
                    key={months[index].key}
                    className="border-t-2 border-zinc-300 px-3 py-2 text-right tabular-nums dark:border-zinc-700"
                  >
                    {count}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
