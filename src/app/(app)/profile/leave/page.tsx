import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { LEAVE_TYPE_LABELS } from "@/lib/leave";
import { formatDay } from "@/lib/format-date";
import { myEmployee } from "../data";
import { NoEmployeeRecord } from "../no-employee";

export const metadata = { title: "My leave" };

export default async function ProfileLeavePage() {
  const user = await requireUser();
  const employee = await myEmployee(user, {
    leaveEntries: { orderBy: { postedOn: "desc" }, take: 20 },
  });

  if (!employee) {
    return (
      <PageShell>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">My leave</h1>
        <NoEmployeeRecord email={user.email} />
      </PageShell>
    );
  }

  const leaveAgg = await db.leaveEntry.aggregate({
    where: {
      employeeId: employee.id,
      type: { in: ["FULL_DAY", "HALF_DAY"] },
      status: { not: "REJECTED" },
      startDate: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) },
    },
    _sum: { days: true },
  });
  const leaveDaysThisYear = Number(leaveAgg._sum.days ?? 0);

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
        My leave{" "}
        <span className="text-sm font-normal text-zinc-500">
          {leaveDaysThisYear} day{leaveDaysThisYear === 1 ? "" : "s"} in{" "}
          {new Date().getUTCFullYear()}
        </span>
      </h1>
      <ul className="mt-6 flex flex-col gap-2 text-sm">
        {employee.leaveEntries.length === 0 && (
          <li className="text-zinc-500">
            No leave posts found in Basecamp check-ins.
          </li>
        )}
        {employee.leaveEntries.map((leave) => (
          <li
            key={leave.id}
            className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <span className="font-medium">
              {leave.type ? LEAVE_TYPE_LABELS[leave.type] : "Pending"}
            </span>{" "}
            · {formatDay(leave.startDate ?? leave.postedOn)}
            {leave.endDate && leave.startDate && leave.endDate > leave.startDate
              ? ` → ${formatDay(leave.endDate)}`
              : ""}
            {leave.reason ? ` · ${leave.reason}` : ""}
            <span
              className={
                leave.status === "APPROVED"
                  ? "ml-2 text-xs text-emerald-600 dark:text-emerald-400"
                  : leave.status === "REJECTED"
                    ? "ml-2 text-xs text-rose-600 dark:text-rose-400"
                    : "ml-2 text-xs text-amber-600 dark:text-amber-400"
              }
            >
              {leave.status.charAt(0) + leave.status.slice(1).toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
