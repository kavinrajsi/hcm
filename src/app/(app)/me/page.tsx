import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { decryptField, maskValue } from "@/lib/crypto";
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

export const metadata = { title: "My Profile" };

export default async function MePage() {
  const user = await requireUser();

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
      <main className="mx-auto w-full max-w-4xl flex-1 min-w-0 px-4 py-5 md:px-6 md:py-10">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          My Profile
        </h1>
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          No employee record is linked to {user.email}. Ask HR to set your work
          email on your employee record.
        </p>
      </main>
    );
  }

  const upcoming = employee.registrations
    .filter((r) => r.session.date >= new Date())
    .map((r) => r.session);

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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 min-w-0 px-4 py-5 md:px-6 md:py-10">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
        {employee.name}
        <span className="ml-3 text-base font-normal text-zinc-500">
          {employee.empId} · {employee.designation} · {employee.department}
        </span>
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-5 text-sm sm:grid-cols-4 dark:border-zinc-800">
        <div>
          <dt className="text-zinc-500">Joined</dt>
          <dd className="mt-0.5 font-medium">
            {employee.dateOfJoining.toISOString().slice(0, 10)} ·{" "}
            {employee.empType}
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
      </dl>

      <h2 className="mt-10 text-lg font-medium">Contact info</h2>
      <div className="mt-3">
        <ContactForm
          action={updateAction}
          defaults={{
            phone: employee.phone,
            personalEmail: employee.personalEmail,
            emergencyContact: employee.emergencyContact ?? undefined,
            address: employee.address ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            pincode: employee.pincode ?? undefined,
          }}
        />
      </div>

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
            {employee.quantumEntries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.date.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{e.brand}</TableCell>
                <TableCell>{e.workName}</TableCell>
                <TableCell>
                  {e.durationMins > 0
                    ? `${Math.floor(e.durationMins / 60)}h ${e.durationMins % 60}m`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
        {employee.leaveEntries.map((l) => (
          <li
            key={l.id}
            className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <span className="font-medium">
              {l.type ? LEAVE_TYPE_LABELS[l.type] : "Pending"}
            </span>{" "}
            · {(l.startDate ?? l.postedOn).toISOString().slice(0, 10)}
            {l.endDate && l.startDate && l.endDate > l.startDate
              ? ` → ${l.endDate.toISOString().slice(0, 10)}`
              : ""}
            {l.reason ? ` · ${l.reason}` : ""}
            <span
              className={
                l.status === "APPROVED"
                  ? "ml-2 text-xs text-emerald-600 dark:text-emerald-400"
                  : l.status === "REJECTED"
                    ? "ml-2 text-xs text-rose-600 dark:text-rose-400"
                    : "ml-2 text-xs text-amber-600 dark:text-amber-400"
              }
            >
              {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-medium">Upcoming sessions</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {upcoming.length === 0 && (
              <li className="text-zinc-500">No registrations.</li>
            )}
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="font-medium">{s.name}</span> ·{" "}
                {s.date.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                })}{" "}
                · {s.trainer}
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
            {employee.attendance.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="font-medium">{a.sessionName}</span> ·{" "}
                {a.date.toISOString().slice(0, 10)} ·{" "}
                {a.attended ? "attended" : "missed"}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
