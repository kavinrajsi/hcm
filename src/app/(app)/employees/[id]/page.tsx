import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { decryptField, maskValue } from "@/lib/crypto";
import { updateEmployee } from "../actions";
import { EmployeeForm, type SensitiveMasks } from "../employee-form";

export const metadata = { title: "Employee" };

const DOCUMENTS = [
  ["photoBlobKey", "Photo"],
  ["panBlobKey", "PAN"],
  ["aadhaarBlobKey", "Aadhaar"],
  ["offerLetterBlobKey", "Offer letter"],
  ["experienceLetterBlobKey", "Experience letter"],
  ["relievingLetterBlobKey", "Relieving letter"],
] as const;

function mask(enc: string | null): string | undefined {
  if (!enc) return undefined;
  return maskValue(decryptField(enc));
}

export default async function EmployeePage({
  params,
}: PageProps<"/employees/[id]">) {
  await requireRole("HR_ADMIN");
  const { id } = await params;

  const [employee, managers] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      include: { idCard: true, probation: true, onboarding: true },
    }),
    db.employee.findMany({
      where: { dateOfExit: null, NOT: { id } },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {employee.name}
          <span className="ml-3 text-base font-normal text-zinc-500">
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
            {employee.idCard?.status ?? "—"}
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
            dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10),
            bloodGroup: employee.bloodGroup ?? undefined,
            tshirtSize: employee.tshirtSize ?? undefined,
            phone: employee.phone,
            personalEmail: employee.personalEmail,
            workEmail: employee.workEmail,
            emergencyContact: employee.emergencyContact ?? undefined,
            address: employee.address ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            pincode: employee.pincode ?? undefined,
            department: employee.department,
            designation: employee.designation,
            dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
            empType: employee.empType,
            isFresher: employee.isFresher,
            pfNumber: employee.pfNumber ?? undefined,
            uanNumber: employee.uanNumber ?? undefined,
            linkedinId: employee.linkedinId ?? undefined,
            managerId: employee.managerId ?? undefined,
          }}
        />
      </div>
    </main>
  );
}
