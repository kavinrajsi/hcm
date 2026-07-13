import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NewSessionForm } from "./session-forms";
import { importSessions, registerForSession } from "./actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { SESSION_IMPORT_COLUMNS } from "@/lib/import-columns";

export const metadata = { title: "Session Calendar" };

// Sessions from the last week onward (recently held + upcoming).
async function getSessions() {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  return db.trainingSession.findMany({
    orderBy: { date: "asc" },
    where: { date: { gte: cutoff } },
    include: {
      registrations: {
        include: { employee: { select: { name: true, workEmail: true } } },
      },
    },
  });
}

export default async function SessionsPage() {
  const user = await requireUser();
  const sessions = await getSessions();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Session Calendar
        </h1>
        <Link
          href="/sessions/attended"
          className="text-sm underline underline-offset-4"
        >
          Attendance log →
        </Link>
      </div>

      {user.role === "HR_ADMIN" && (
        <div className="mt-6 flex flex-col gap-3">
          <NewSessionForm />
          <div>
            <BulkImportForm
              action={importSessions}
              columns={SESSION_IMPORT_COLUMNS}
              title="Import sessions"
            />
          </div>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500">
                  No upcoming sessions.
                </TableCell>
              </TableRow>
            )}
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  {s.date.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </TableCell>
                <TableCell>{s.trainer}</TableCell>
                <TableCell>
                  {s.mode === "IN_PERSON" ? "In-person" : "Virtual"}
                </TableCell>
                <TableCell>
                  {s.registrations.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span title={s.registrations.map((r) => r.employee.name).join(", ")}>
                      {s.registrations.length} registered
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <form action={registerForSession}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Register
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
