import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { decryptField, maskValue } from "@/lib/crypto";
import { readPii } from "@/lib/employee-pii";
import {
  EMPLOYEE_DOCUMENTS,
  previousEmploymentLinks,
} from "@/lib/employee-documents";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateOwnContact } from "./actions";
import { ContactForm } from "./contact-form";
import { QuantumEntryForm } from "../quantum/quantum-entry-form";
import { LEAVE_TYPE_LABELS } from "@/lib/leave";
import { NameForm, PasswordForm } from "./profile-forms";
import { formatDateTime, formatDay, formatInstantDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { EmployeeDevices } from "../devices/employee-devices";
import { ConnectedApps } from "./connected-apps";

export const metadata = { title: "My Profile" };

// One page for the signed-in person: their employee record (when HR has
// linked one) followed by sign-in account settings, which every login has.

type Account = {
  email: string;
  name: string | null;
  role: string;
  passwordHash: string | null;
  createdAt: Date;
};

function AccountSection({ account }: { account: Account }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Account</h2>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account info</CardTitle>
            <CardDescription>
              {account.email} ·{" "}
              <Badge variant="secondary">{account.role}</Badge> · member since{" "}
              {formatInstantDay(account.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NameForm defaultName={account.name ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              {account.passwordHash
                ? "Change the password you use to sign in."
                : "No password set yet — add one to sign in with credentials."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm hasPassword={account.passwordHash !== null} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default async function ProfilePage() {
  const user = await requireUser();
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      createdAt: true,
    },
  });
  if (!account) return null;

  // Resolve (and lazily link) the caller's employee record by work email.
  const employee = await db.employee.findFirst({
    where: { OR: [{ userId: user.id }, { workEmail: user.email }] },
    include: {
      probation: true,
      idCard: true,
      onboarding: true,
      quantumEntries: { orderBy: { date: "desc" }, take: 20 },
      attendance: { orderBy: { date: "desc" }, take: 10 },
      leaveEntries: { orderBy: { postedOn: "desc" }, take: 20 },
      registrations: { include: { session: true } },
      previousEmployments: { orderBy: { position: "asc" } },
    },
  });
  if (employee && !employee.userId) {
    await db.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
    });
  }

  if (!employee) {
    return (
      <PageShell>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          My Profile
        </h1>
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          No employee record is linked to {user.email}. Ask HR to set your work
          email on your employee record.
        </p>
        <AccountSection account={account} />
        <ConnectedApps userId={user.id} />
      </PageShell>
    );
  }

  const upcoming = employee.registrations
    .filter((registration) => registration.session.date >= new Date())
    .map((registration) => registration.session);

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

      <EmployeeDevices employeeId={employee.id} title="My devices" />

      <h2 className="mt-10 text-lg font-medium">Log work (Quantum Sheet)</h2>
      <div className="mt-3">
        <QuantumEntryForm employeeId={employee.id} />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employee.quantumEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-zinc-500">
                  No entries yet.
                </TableCell>
              </TableRow>
            )}
            {employee.quantumEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDay(entry.date)}</TableCell>
                <TableCell>{entry.brand}</TableCell>
                <TableCell>{entry.workName}</TableCell>
                <TableCell>
                  {entry.durationMins > 0
                    ? `${Math.floor(entry.durationMins / 60)}h ${entry.durationMins % 60}m`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-medium">Upcoming sessions</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {upcoming.length === 0 && (
              <li className="text-zinc-500">No registrations.</li>
            )}
            {upcoming.map((session) => (
              <li
                key={session.id}
                className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="font-medium">{session.name}</span> ·{" "}
                {formatDateTime(session.date)} · {session.trainer}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-medium">Sessions attended</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {employee.attendance.length === 0 && (
              <li className="text-zinc-500">Nothing logged yet.</li>
            )}
            {employee.attendance.map((record) => (
              <li
                key={record.id}
                className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="font-medium">{record.sessionName}</span> ·{" "}
                {formatDay(record.date)} ·{" "}
                {record.attended ? "attended" : "missed"}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h2 className="mt-10 text-lg font-medium">
        My leave{" "}
        <span className="text-sm font-normal text-zinc-500">
          {leaveDaysThisYear} day{leaveDaysThisYear === 1 ? "" : "s"} in{" "}
          {new Date().getUTCFullYear()}
        </span>
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
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

      <h2 className="mt-10 text-lg font-medium">Contact info</h2>
      <div className="mt-3">
        <ContactForm
          action={updateAction}
          defaults={{
            phone: pii.phone ?? "",
            personalEmail: pii.personalEmail ?? "",
            emergencyContact: pii.emergencyContact ?? undefined,
            address: pii.address ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            pincode: employee.pincode ?? undefined,
          }}
        />
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-5 text-sm sm:grid-cols-4 dark:border-zinc-800">
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
      <AccountSection account={account} />
      <ConnectedApps userId={user.id} />
    </PageShell>
  );
}
