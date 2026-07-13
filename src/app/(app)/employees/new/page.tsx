import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { createEmployee } from "../actions";
import { EmployeeForm } from "../employee-form";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireRole("HR_ADMIN");
  const managers = await db.employee.findMany({
    where: { dateOfExit: null },
    orderBy: { name: "asc" },
    select: { id: true, empId: true, name: true },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add employee</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Completing this form creates the employee master record, onboarding
        entry, and ID card tracker.
      </p>
      <div className="mt-8">
        <EmployeeForm
          action={createEmployee}
          managers={managers}
          submitLabel="Create employee"
        />
      </div>
    </main>
  );
}
