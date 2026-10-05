import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { decryptField, maskValue } from "@/lib/crypto";
import { readPii } from "@/lib/employee-pii";
import {
  EMPLOYEE_DOCUMENTS,
  previousEmploymentLinks,
} from "@/lib/employee-documents";
import { formatDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { updateOwnContact } from "./actions";
import { ContactForm } from "./contact-form";
import { myEmployee } from "./data";
import { NoEmployeeRecord } from "./no-employee";

export const metadata = { title: "My Profile" };

// Profile → Overview: the signed-in person's employee record (when HR has
// linked one). Work, leave and sign-in settings are the other Profile pages.
export default async function ProfilePage() {
  const user = await requireUser();
  const employee = await myEmployee(user, {
    probation: true,
    idCard: true,
    previousEmployments: { orderBy: { position: "asc" } },
  });

  if (!employee) {
    return (
      <PageShell>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          My Profile
        </h1>
        <NoEmployeeRecord email={user.email} />
      </PageShell>
    );
  }

  const pii = readPii(employee);
  const masked = {
    pan: employee.panEnc ? maskValue(decryptField(employee.panEnc)) : "—",
    aadhaar: employee.aadhaarEnc
      ? maskValue(decryptField(employee.aadhaarEnc))
      : "—",
    bank: employee.bankAccountEnc
      ? maskValue(decryptField(employee.bankAccountEnc))
      : "—",
  };

  const updateAction = updateOwnContact.bind(null, employee.id);
  const letters = previousEmploymentLinks(employee.previousEmployments);

  return (
    <PageShell>
      <div className="flex items-center gap-4">
        <EmployeeAvatar
          name={employee.name}
          avatarKey={employee.avatarBlobKey}
          size="lg"
        />
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {employee.name}
          <span className="block text-base font-normal text-zinc-500 md:ml-3 md:inline">
            {employee.empId} · {employee.designation} · {employee.department}
          </span>
        </h1>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-5 text-sm sm:grid-cols-4 dark:border-zinc-800">
        <div>
          <dt className="text-zinc-500">Joined</dt>
          <dd className="mt-0.5 font-medium">
            {formatDay(employee.dateOfJoining)} · {employee.empType}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Probation</dt>
          <dd className="mt-0.5 font-medium">
            {employee.probation
              ? `${employee.probation.status} · due ${formatDay(employee.probation.dueDate)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">ID card</dt>
          <dd className="mt-0.5 font-medium">
            {employee.idCard?.status ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">PAN / Aadhaar / Bank</dt>
          <dd className="mt-0.5 font-medium">
            {masked.pan} · {masked.aadhaar} · {masked.bank}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Documents</dt>
          <dd className="mt-0.5 flex flex-wrap gap-x-2 font-medium">
            {EMPLOYEE_DOCUMENTS.filter(([key]) => employee[key]).map(
              ([key, label]) => (
                <a
                  key={key}
                  href={`/api/files/${employee[key]}`}
                  className="underline underline-offset-4"
                >
                  {label}
                </a>
              ),
            )}
            {letters.map((link) => (
              <a
                key={link.key}
                href={`/api/files/${link.key}`}
                className="underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
            {EMPLOYEE_DOCUMENTS.every(([key]) => !employee[key]) &&
              letters.length === 0 &&
              "—"}
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-lg font-medium">Contact info</h2>
      <div className="mt-3">
        <ContactForm
          action={updateAction}
          defaults={{
            phone: pii.phone ?? "",
            personalEmail: pii.personalEmail ?? "",
            emergencyContact: pii.emergencyContact ?? undefined,
            fatherName: employee.fatherName ?? undefined,
            address: pii.address ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            pincode: employee.pincode ?? undefined,
          }}
        />
      </div>
    </PageShell>
  );
}
