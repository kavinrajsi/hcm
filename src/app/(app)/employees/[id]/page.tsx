import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageShell } from "@/components/page";
import { requirePageRole } from "@/lib/rbac";
import { decryptField, maskValue } from "@/lib/crypto";
import { readPii } from "@/lib/employee-pii";
import { updateEmployee } from "../actions";
import { EmployeeForm, type SensitiveMasks } from "../employee-form";
import { IdCardHistory } from "./id-card-history";
import { EmployeeTabs, employeeTab } from "./tabs";
import { LeaveHistory } from "./leave-history";
import { EmployeeDevices } from "../../devices/employee-devices";
import { BasecampAccess } from "./basecamp-access";
import {
  CreateLoginButton,
  RoleSelect,
  UserActions,
} from "../../users/user-controls";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Employee" };

function mask(enc: string | null): string | undefined {
  if (!enc) return undefined;
  return maskValue(decryptField(enc));
}

export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<"/employees/[id]">) {
  const me = await requirePageRole("HR_ADMIN");
  const { id } = await params;
  const { leaveYear, tab: tabParam } = await searchParams;
  const tab = employeeTab(tabParam);

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
        previousEmployments: { orderBy: { position: "asc" } },
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
    <PageShell>
      {/* Cover, then photo + name overlapping it (as in Zoho People). */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div
          aria-hidden="true"
          className="h-28 bg-[#0b1f14] bg-cover bg-center md:h-40"
          style={{ backgroundImage: "url(/covers/employee-cover.svg)" }}
        />
        <div className="flex flex-col gap-3 bg-background px-4 pb-4 md:flex-row md:items-end md:justify-between md:px-6">
          <div className="flex items-end gap-4">
            <EmployeeAvatar
              name={employee.name}
              avatarKey={employee.avatarBlobKey}
              size="lg"
              className="-mt-10 size-20 border-4 border-background text-2xl md:-mt-12 md:size-24"
            />
            <h1 className="pb-1 text-xl font-semibold tracking-tight md:text-2xl">
              {employee.name}
              <span className="block text-sm font-normal text-zinc-500 md:text-base">
                {employee.empId} · {employee.designation}
              </span>
            </h1>
          </div>
          <Link
            href="/employees"
            className="pb-1 text-sm text-zinc-500 underline-offset-4 hover:underline"
          >
            Back to list
          </Link>
        </div>
      </div>

      <EmployeeTabs employeeId={employee.id} active={tab} />

      <div className="mt-6">
        {tab === "profile" && (
          <div>
            <EmployeeForm
              action={update}
              submitLabel="Save changes"
              typeEndBase="today"
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
                fatherName: employee.fatherName ?? undefined,
                address: pii.address ?? undefined,
                city: employee.city ?? undefined,
                state: employee.state ?? undefined,
                pincode: employee.pincode ?? undefined,
                department: employee.department,
                designation: employee.designation,
                dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
                empType: employee.empType,
                typeEndDate: (employee.empType === "PROBATION"
                  ? employee.probation?.dueDate
                  : employee.empType === "PERMANENT"
                    ? null
                    : employee.empTypeEndsOn
                )
                  ?.toISOString()
                  .slice(0, 10),
                isFresher: employee.isFresher,
                pfNumber: pii.pfNumber ?? undefined,
                uanNumber: pii.uanNumber ?? undefined,
                linkedinId: employee.linkedinId ?? undefined,
                previousEmployments: employee.previousEmployments.map((row) => ({
                  id: row.id,
                  companyName: row.companyName,
                  offerLetterBlobKey: row.offerLetterBlobKey,
                  experienceLetterBlobKey: row.experienceLetterBlobKey,
                  relievingLetterBlobKey: row.relievingLetterBlobKey,
                })),
                managerId: employee.managerId ?? undefined,
              }}
            />
          </div>
        )}
        {tab === "leave" && (
          <div>
            <LeaveHistory
              employeeId={employee.id}
              employeeName={employee.name}
              year={typeof leaveYear === "string" ? leaveYear : undefined}
              entries={leave.map((leaveEntry) => ({
                ...leaveEntry,
                days: leaveEntry.days !== null ? Number(leaveEntry.days) : null,
                reviewedBy: leaveEntry.reviewedBy
                  ? (leaveEntry.reviewedBy.name ?? leaveEntry.reviewedBy.email)
                  : null,
              }))}
            />
          </div>
        )}
        {tab === "devices" && (
          <EmployeeDevices employeeId={employee.id} title="Devices" history provision />
        )}
        {tab === "id-card" && (
          <>
            {employee.idCard ? (
              <IdCardHistory changes={employee.idCard.statusChanges} />
            ) : (
              <p className="text-sm text-zinc-500">No ID card yet.</p>
            )}
          </>
        )}
        {tab === "login" && (
          <div className="flex flex-col gap-10">
            <section className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
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
            <section>
              <h2 className="text-lg font-medium">Basecamp</h2>
              <div className="mt-3">
                <BasecampAccess employeeId={employee.id} linked={Boolean(employee.basecampPersonId)} />
              </div>
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}
