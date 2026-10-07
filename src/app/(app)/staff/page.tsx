import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Staff" };

// Every current employee as photo and name, for any signed-in user. Only
// what colleagues already see in Basecamp — no PII.
export default async function StaffPage() {
  const user = await requireUser();
  const employees = await db.employee.findMany({
    where: { dateOfExit: null },
    select: { id: true, name: true, avatarBlobKey: true },
    orderBy: { name: "asc" },
  });
  const canOpenEmployee = user.role === "HR_ADMIN";

  return (
    <PageShell>
      <PageHeader
        title="Staff"
        description={`Everyone at the company · ${employees.length}`}
      />

      {employees.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No employees yet.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:mt-6 md:grid-cols-6 lg:grid-cols-8">
          {employees.map((employee) => (
            <li
              key={employee.id}
              className="flex min-w-0 flex-col items-center gap-2 text-center"
            >
              <EmployeeAvatar
                name={employee.name}
                avatarKey={employee.avatarBlobKey}
                size="lg"
                className="size-16 md:size-20"
              />
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
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
