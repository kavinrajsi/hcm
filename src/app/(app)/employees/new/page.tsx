import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { createEmployee } from "../actions";
import { EmployeeForm, type EmployeeDefaults } from "../employee-form";

export const metadata = { title: "Add employee" };

/** Form defaults from a candidate (Candidates → Convert to employee). */
async function fromCandidate(raw: string | string[] | undefined) {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = BigInt(raw);
  const [candidate, converted] = await Promise.all([
    db.candidate.findUnique({ where: { id } }),
    db.employee.findUnique({
      where: { candidateId: id },
      select: { id: true, empId: true, name: true },
    }),
  ]);
  if (!candidate) return null;
  const name = [candidate.firstName, candidate.lastName]
    .filter(Boolean)
    .join(" ");
  const defaults: EmployeeDefaults = {
    name,
    personalEmail: candidate.email ?? undefined,
    phone: candidate.mobileNumber ?? undefined,
    designation: candidate.jobRole ?? undefined,
    empType: candidate.position === "Intern" ? "INTERN" : "PROBATION",
  };
  return { id: raw, name: name || "this candidate", defaults, converted };
}

export default async function NewEmployeePage({
  searchParams,
}: PageProps<"/employees/new">) {
  await requireRole("HR_ADMIN");
  const [managers, candidate] = await Promise.all([
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
    fromCandidate((await searchParams).candidate),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 min-w-0 px-4 py-5 md:px-6 md:py-8">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
        Add employee
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Completing this form creates the employee master record, onboarding
        entry, ID card tracker and an Employee login.
      </p>

      {candidate?.converted ? (
        <p className="mt-6 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          {candidate.name} has already been converted to{" "}
          <Link
            href={`/employees/${candidate.converted.id}`}
            className="font-medium underline underline-offset-4"
          >
            {candidate.converted.empId} — {candidate.converted.name}
          </Link>
          .
        </p>
      ) : (
        <>
          {candidate && (
            <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              Pre-filled from candidate <strong>{candidate.name}</strong>. Add
              the Emp ID, work email, department and joining date, and check the
              rest.
            </p>
          )}
          <div className="mt-8">
            <EmployeeForm
              action={createEmployee}
              managers={managers}
              submitLabel="Create employee"
              defaults={candidate?.defaults}
              hidden={candidate ? { candidateId: candidate.id } : undefined}
            />
          </div>
        </>
      )}
    </main>
  );
}
