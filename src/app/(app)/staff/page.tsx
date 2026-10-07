import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { PersonTodos } from "./person-todos";
import { TodoRing } from "./todo-ring";

export const metadata = { title: "Staff" };

/** Synced to-do counts split for the ring; null until the first sync. */
function todoCounts(employee: {
  openTodosDated: number | null;
  openTodosUndated: number | null;
  openTodosOverdue: number | null;
}) {
  const { openTodosDated, openTodosUndated, openTodosOverdue } = employee;
  if (openTodosDated === null || openTodosUndated === null) return null;
  const overdue = openTodosOverdue ?? 0;
  return {
    overdue,
    upcoming: openTodosDated - overdue,
    undated: openTodosUndated,
  };
}

// Every current employee as photo and name, for any signed-in user. Only
// what colleagues already see in Basecamp — no PII.
export default async function StaffPage() {
  const user = await requireUser();
  const employees = await db.employee.findMany({
    where: { dateOfExit: null },
    select: {
      id: true,
      name: true,
      avatarBlobKey: true,
      basecampPersonId: true,
      openTodosDated: true,
      openTodosUndated: true,
      openTodosOverdue: true,
    },
    orderBy: { name: "asc" },
  });
  const canOpenEmployee = user.role === "HR_ADMIN";

  return (
    <PageShell>
      <PageHeader
        title="Staff"
        description={`Everyone at the company · ${employees.length}. Open Basecamp to-dos, with and without a due date, update overnight (2–8 am IST). Ring: red overdue, amber dated, grey no date. Click a photo for the list.`}
      />

      {employees.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No employees yet.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:mt-6 md:grid-cols-6 lg:grid-cols-8">
          {employees.map((employee) => {
            const counts = todoCounts(employee);
            const photo = (
              <EmployeeAvatar
                name={employee.name}
                avatarKey={employee.avatarBlobKey}
                size="lg"
                className="size-16 md:size-20"
              />
            );
            const ringed = counts ? (
              <TodoRing {...counts}>{photo}</TodoRing>
            ) : (
              <span className="inline-flex p-1">{photo}</span>
            );
            return (
              <li
                key={employee.id}
                className="flex min-w-0 flex-col items-center gap-2 text-center"
              >
                {employee.basecampPersonId ? (
                  <PersonTodos employeeId={employee.id} name={employee.name}>
                    <span className="block transition-opacity hover:opacity-80">
                      {ringed}
                    </span>
                  </PersonTodos>
                ) : (
                  ringed
                )}
                {canOpenEmployee ? (
                  <Link
                    href={`/employees/${employee.id}`}
                    className="line-clamp-2 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {employee.name}
                  </Link>
                ) : (
                  <span className="line-clamp-2 text-sm font-medium">
                    {employee.name}
                  </span>
                )}
                {counts && (
                  <p className="-mt-1 text-xs text-zinc-500 tabular-nums">
                    {counts.overdue > 0 && (
                      <>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {counts.overdue} overdue
                        </span>{" "}
                        ·{" "}
                      </>
                    )}
                    {counts.upcoming} dated · {counts.undated} no date
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
