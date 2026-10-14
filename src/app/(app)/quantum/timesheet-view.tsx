import { EmployeeAvatar } from "@/components/employee-avatar";
import { Download as DownloadIcon } from "lucide-react";
import { formatDay } from "@/lib/format-date";
import { decimalHours, type TimesheetProject } from "@/lib/quantum/timesheet";

// Quantum Sheet "Timesheet" view: like Basecamp's timesheet report — one
// table per project (Date, Hours, Person, Notes) with its total, busiest
// project first, and a CSV of exactly what's shown.

export function TimesheetView({
  projects,
  totalMinutes,
  csvHref,
}: {
  projects: TimesheetProject[];
  totalMinutes: number;
  csvHref: string;
}) {
  const entries = projects.reduce((sum, project) => sum + project.entries.length, 0);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-500">
          <span className="font-semibold text-foreground tabular-nums">{decimalHours(totalMinutes)} hours</span> ·{" "}
          {entries} {entries === 1 ? "entry" : "entries"} · {projects.length}{" "}
          {projects.length === 1 ? "project" : "projects"}
        </p>
        <a
          href={csvHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
        >
          <DownloadIcon className="size-4" />
          Download CSV
        </a>
      </div>

      {projects.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No hours logged for these filters.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-8">
        {projects.map((project) => (
          <section key={project.projectId}>
            <p className="text-[11px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
              Project
            </p>
            <h2 className="text-lg font-semibold">{project.projectName}</h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-emerald-50 text-[11px] tracking-wide text-emerald-800 uppercase dark:bg-emerald-950/40 dark:text-emerald-300">
                  <tr>
                    <th className="w-32 px-3 py-2 text-left font-semibold">Date</th>
                    <th className="w-20 px-3 py-2 text-left font-semibold">Hours</th>
                    <th className="w-56 px-3 py-2 text-left font-semibold">Person</th>
                    <th className="px-3 py-2 text-left font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {project.entries.map((entry) => (
                    <tr key={entry.id} className="align-top odd:bg-zinc-50/60 dark:odd:bg-white/[0.02]">
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatDay(entry.date)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{decimalHours(entry.minutes)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <EmployeeAvatar name={entry.personName} avatarKey={entry.avatarKey} className="size-5 text-[9px]" />
                          <span className="truncate">{entry.personName}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-zinc-500">To-do: </span>
                        <a
                          href={entry.todoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
                        >
                          {entry.todoTitle}
                        </a>
                        {entry.note && (
                          <span className="mt-0.5 block whitespace-pre-line text-zinc-500">{entry.note}</span>
                        )}
                        {entry.source === "hcm" && <span className="mt-0.5 block text-xs text-zinc-400">Logged in HCM</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <td className="px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                      Total
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{decimalHours(project.totalMinutes)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
