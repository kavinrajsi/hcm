import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { formatDay, formatSessionTime } from "@/lib/format-date";
import { EmployeeDevices } from "../../devices/employee-devices";
import { myEmployee } from "../data";
import { NoEmployeeRecord } from "../no-employee";

export const metadata = { title: "My work" };

export default async function ProfileWorkPage() {
  const user = await requireUser();
  const employee = await myEmployee(user, {
    attendance: { orderBy: { date: "desc" }, take: 10 },
    registrations: { include: { session: true } },
  });

  if (!employee) {
    return (
      <PageShell>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">My work</h1>
        <NoEmployeeRecord email={user.email} />
      </PageShell>
    );
  }

  const upcoming = employee.registrations
    .filter((registration) => registration.session.date >= new Date())
    .map((registration) => registration.session);

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">My work</h1>

      <EmployeeDevices employeeId={employee.id} title="My devices" />

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
                {formatSessionTime(session.date)} · {session.trainer}
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
    </PageShell>
  );
}
