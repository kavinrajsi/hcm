import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Review Meetings" };

// Placeholder module — fields not finalized yet (planning follow-up).
// Schema stub (ReviewMeeting: employee, date, notes) exists so records
// created elsewhere surface here once the module is specced.
export default async function ReviewsPage() {
  await requireRole("HR_ADMIN", "MANAGER");

  const meetings = await db.reviewMeeting.findMany({
    orderBy: { date: "desc" },
    take: 50,
    include: { employee: { select: { id: true, empId: true, name: true } } },
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Review Meetings</h1>
      <p className="mt-2 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        Planning in progress — fields for this module are still being worked
        out. Records will appear below once the module is finalized.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-zinc-500">
                  No review meetings recorded.
                </TableCell>
              </TableRow>
            )}
            {meetings.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    href={`/employees/${m.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {m.employee.name}
                  </Link>
                </TableCell>
                <TableCell>{m.date.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{m.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
