import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { datePartsToRange, parseTableParams } from "@/lib/table-params";
import { TableFilters } from "@/components/data-table/filters";
import { TablePagination } from "@/components/data-table/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { CollapsibleForm } from "@/components/collapsible-form";
import { AttendanceForm } from "../session-forms";
import { importAttendance } from "../actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { ATTENDANCE_IMPORT_COLUMNS } from "@/lib/import-columns";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Session Attended" };

export default async function SessionAttendedPage({
  searchParams,
}: PageProps<"/sessions/attended">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.SessionAttendanceWhereInput = {
    ...(params.q
      ? {
          OR: [
            { employee: { name: { contains: params.q, mode: "insensitive" } } },
            { sessionName: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const dateRange = datePartsToRange(params);
  if (dateRange) where.date = dateRange;

  const [rows, total, employees, sessions] = await Promise.all([
    db.sessionAttendance.findMany({
      where,
      orderBy: { date: "desc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: { select: { id: true, empId: true, name: true } },
      },
    }),
    db.sessionAttendance.count({ where }),
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
    db.trainingSession.findMany({
      orderBy: { date: "desc" },
      take: 50,
      select: { id: true, name: true, trainer: true, date: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Session Attended"
        actions={
          <>
            <BulkImportForm
              action={importAttendance}
              columns={ATTENDANCE_IMPORT_COLUMNS}
              title="Import attendance"
            />
            <Link
              href="/sessions"
              className="inline-flex min-h-10 items-center text-sm underline underline-offset-4 md:min-h-0"
            >
              ← Session calendar
            </Link>
          </>
        }
      />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="Log attendance">
          <AttendanceForm
            employees={employees}
            sessions={sessions.map((s) => ({
              id: s.id,
              name: s.name,
              trainer: s.trainer,
              date: s.date.toISOString().slice(0, 10),
            }))}
          />
        </CollapsibleForm>
      </div>

      <div className="mt-6">
        <TableFilters />
      </div>

      <div className="mt-4">
        <MobileList isEmpty={rows.length === 0} empty="No attendance logged.">
          {rows.map((r) => (
            <ListCard
              key={r.id}
              href={`/employees/${r.employee.id}`}
              title={r.employee.name}
              subtitle={
                <>
                  {r.sessionName}
                  {r.notes && (
                    <span className="mt-1 line-clamp-3 block">{r.notes}</span>
                  )}
                </>
              }
              badge={
                <span
                  className={
                    r.attended
                      ? "rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300"
                      : "rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
                  }
                >
                  {r.attended ? "Attended" : "Not attended"}
                </span>
              }
              meta={
                <>
                  <span>{r.date.toISOString().slice(0, 10)}</span>
                  {r.trainer && <span>{r.trainer}</span>}
                </>
              }
            />
          ))}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500">
                  No attendance logged.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.employee.name}
                  </Link>
                </TableCell>
                <TableCell>{r.sessionName}</TableCell>
                <TableCell>{r.date.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{r.attended ? "Yes" : "No"}</TableCell>
                <TableCell>{r.trainer ?? "—"}</TableCell>
                <TableCell className="max-w-56 truncate">
                  {r.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>

      <div className="mt-4">
        <TablePagination
          page={params.page}
          total={total}
          searchParams={raw}
          pathname="/sessions/attended"
        />
      </div>
    </PageShell>
  );
}
