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
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { CollapsibleForm } from "@/components/collapsible-form";
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

function formatSessionDate(date: Date) {
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default async function SessionsPage() {
  const user = await requireUser();
  const sessions = await getSessions();

  return (
    <PageShell>
      <PageHeader
        title="Session Calendar"
        actions={
          <>
            {user.role === "HR_ADMIN" && (
              <BulkImportForm
                action={importSessions}
                columns={SESSION_IMPORT_COLUMNS}
                title="Import sessions"
              />
            )}
            <Link
              href="/sessions/attended"
              className="inline-flex min-h-10 items-center text-sm underline underline-offset-4 md:min-h-0"
            >
              Attendance log →
            </Link>
          </>
        }
      />

      {user.role === "HR_ADMIN" && (
        <div className="mt-5 md:mt-6">
          <CollapsibleForm label="Add session">
            <NewSessionForm />
          </CollapsibleForm>
        </div>
      )}

      <div className="mt-6">
        <MobileList
          isEmpty={sessions.length === 0}
          empty="No upcoming sessions."
        >
          {sessions.map((s) => (
            <ListCard
              key={s.id}
              title={s.name}
              subtitle={formatSessionDate(s.date)}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {s.mode === "IN_PERSON" ? "In-person" : "Virtual"}
                </span>
              }
              meta={
                <>
                  <span>{s.trainer}</span>
                  <span>
                    {s.registrations.length === 0
                      ? "No registrations"
                      : `${s.registrations.length} registered`}
                  </span>
                </>
              }
              actions={
                <form action={registerForSession} className="w-full">
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-10 w-full"
                  >
                    Register
                  </Button>
                </form>
              }
            />
          ))}
        </MobileList>
      </div>

      <DesktopTable>
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
                <TableCell>{formatSessionDate(s.date)}</TableCell>
                <TableCell>{s.trainer}</TableCell>
                <TableCell>
                  {s.mode === "IN_PERSON" ? "In-person" : "Virtual"}
                </TableCell>
                <TableCell>
                  {s.registrations.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span
                      title={s.registrations
                        .map((r) => r.employee.name)
                        .join(", ")}
                    >
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
      </DesktopTable>
    </PageShell>
  );
}
