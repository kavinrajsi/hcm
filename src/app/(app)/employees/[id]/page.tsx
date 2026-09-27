import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { decryptField, maskValue } from "@/lib/crypto";
import { readPii } from "@/lib/employee-pii";
import { EMPLOYEE_DOCUMENTS } from "@/lib/employee-documents";
import { updateEmployee } from "../actions";
import { EmployeeForm, type SensitiveMasks } from "../employee-form";
import { IdCardHistory } from "./id-card-history";
import { LeaveHistory } from "./leave-history";
import {
  CreateLoginButton,
  RoleSelect,
  UserActions,
} from "../../users/user-controls";
import { idCardStatusLabel } from "@/lib/id-card-status";

export const metadata = { title: "Employee" };

const DOCUMENTS = EMPLOYEE_DOCUMENTS;

function mask(enc: string | null): string | undefined {
  if (!enc) return undefined;
  return maskValue(decryptField(enc));
}

export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<"/employees/[id]">) {
  const me = await requireRole("HR_ADMIN");
  const { id } = await params;
  const { leaveYear } = await searchParams;

  const [employee, managers, leave] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      include: {
        idCard: {
          include: {
            statusChanges: {
              orderBy: { changedAt: "desc" },
              take: 50,
              include: { changedBy: { select: { name: true, email: true } } },
            },
          },
        },
        probation: true,
        onboarding: true,
        user: {
          select: {
            id: true,
            role: true,
            disabledAt: true,
            passwordHash: true,
          },
        },
      },
    }),
    db.employee.findMany({
      where: { dateOfExit: null, NOT: { id } },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
    // Every leave post for this employee (bounded: ~100 per person).
    db.leaveEntry.findMany({
      where: { employeeId: id },
      orderBy: [{ postedOn: "desc" }, { postedAt: "desc" }],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        postedOn: true,
        type: true,
        days: true,
        status: true,
        message: true,
        link: true,
        classifiedBy: true,
        reviewedBy: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!employee) notFound();

  // Masked previews — full values are never round-tripped to the form.
  const masks: SensitiveMasks = {
    pan: mask(employee.panEnc),
    aadhaar: mask(employee.aadhaarEnc),
    bankAccount: mask(employee.bankAccountEnc),
    ifsc: mask(employee.ifscEnc),
  };

  const update = updateEmployee.bind(null, employee.id);
  const pii = readPii(employee);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 min-w-0 px-4 py-5 md:px-6 md:py-8">
      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-baseline md:justify-between">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {employee.name}
          <span className="block text-base font-normal text-zinc-500 md:ml-3 md:inline">
            {employee.empId} · {employee.designation}
          </span>
        </h1>
        <Link
          href="/employees"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to list
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-5 text-sm sm:grid-cols-4 dark:border-zinc-800">
        <div>
          <dt className="text-zinc-500">ID card</dt>
          <dd className="mt-0.5 font-medium">
            {employee.idCard ? idCardStatusLabel(employee.idCard.status) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Probation</dt>
          <dd className="mt-0.5 font-medium">
            {employee.probation
              ? `${employee.probation.status} · due ${employee.probation.dueDate.toISOString().slice(0, 10)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Onboarded</dt>
          <dd className="mt-0.5 font-medium">
            {employee.onboarding
              ? employee.onboarding.completedAt.toISOString().slice(0, 10)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Documents</dt>
          <dd className="mt-0.5 flex flex-wrap gap-x-2 font-medium">
            {DOCUMENTS.filter(([key]) => employee[key]).map(([key, label]) => (
              <a
                key={key}
                href={`/api/files/${employee[key]}`}
                className="underline underline-offset-4"
              >
                {label}
              </a>
            ))}
            {DOCUMENTS.every(([key]) => !employee[key]) && "—"}
          </dd>
        </div>
      </dl>

      {employee.idCard && (
        <IdCardHistory changes={employee.idCard.statusChanges} />
      )}

      <section className="mt-6 rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Login</h2>
          {employee.user && (
            <span className="text-xs text-zinc-500">
              {employee.user.disabledAt
                ? "Disabled"
                : employee.user.passwordHash
                  ? "Active"
                  : "Invited — password not set yet"}
            </span>
          )}
        </div>
        {employee.user ? (
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start">
            <RoleSelect userId={employee.user.id} role={employee.user.role} />
            <UserActions
              userId={employee.user.id}
              disabled={!!employee.user.disabledAt}
              isSelf={employee.user.id === me.id}
            />
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-2 text-zinc-500">
              No login yet — {employee.workEmail}
              {" can't sign in."}
            </p>
            {!employee.dateOfExit && (
              <CreateLoginButton employeeId={employee.id} />
            )}
          </div>
        )}
      </section>

      <div id="leave-history" className="scroll-mt-20">
        <LeaveHistory
          employeeId={employee.id}
          employeeName={employee.name}
          year={typeof leaveYear === "string" ? leaveYear : undefined}
          entries={leave.map((l) => ({
            ...l,
            days: l.days !== null ? Number(l.days) : null,
            reviewedBy: l.reviewedBy
              ? (l.reviewedBy.name ?? l.reviewedBy.email)
              : null,
          }))}
        />
      </div>

      <div className="mt-8">
        <EmployeeForm
          action={update}
          submitLabel="Save changes"
          masks={masks}
          managers={managers}
          defaults={{
            empId: employee.empId,
            name: employee.name,
            gender: employee.gender ?? undefined,
            dateOfBirth: pii.dateOfBirth ?? undefined,
            bloodGroup: employee.bloodGroup ?? undefined,
            tshirtSize: employee.tshirtSize ?? undefined,
            phone: pii.phone ?? undefined,
            personalEmail: pii.personalEmail ?? undefined,
            workEmail: employee.workEmail,
            emergencyContact: pii.emergencyContact ?? undefined,
            address: pii.address ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            pincode: employee.pincode ?? undefined,
            department: employee.department,
            designation: employee.designation,
            dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
            empType: employee.empType,
            isFresher: employee.isFresher,
            pfNumber: pii.pfNumber ?? undefined,
            uanNumber: pii.uanNumber ?? undefined,
            linkedinId: employee.linkedinId ?? undefined,
            managerId: employee.managerId ?? undefined,
          }}
        />
      </div>
    </main>
  );
}
