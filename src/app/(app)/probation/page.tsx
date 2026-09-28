import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
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
import { Badge } from "@/components/ui/badge";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { ProbationRowActions } from "./probation-row-actions";
import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format-date";

export const metadata = { title: "Probation & Confirmation" };

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "EXTENDED", label: "Extended" },
  { value: "EXITED", label: "Exited" },
];

const badgeVariant = {
  PENDING: "secondary",
  CONFIRMED: "default",
  EXTENDED: "destructive",
  EXITED: "outline",
} as const;

export default async function ProbationPage({
  searchParams,
}: PageProps<"/probation">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Default view: due this month (or the month/year picked in filters).
  const now = new Date();
  const year = params.year ?? now.getUTCFullYear();
  const month = params.month ?? now.getUTCMonth() + 1;
  const monthRange = {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };

  // Open probations only count while the employee is still on Probation;
  // confirmed / exited records stay as history.
  const current: Prisma.ProbationRecordWhereInput = {
    OR: [
      { status: { in: ["CONFIRMED", "EXITED"] } },
      { employee: { empType: "PROBATION" } },
    ],
  };
  const where: Prisma.ProbationRecordWhereInput = {
    ...current,
    dueDate: monthRange,
    ...(params.q
      ? { employee: { name: { contains: params.q, mode: "insensitive" } } }
      : {}),
    ...(params.type ? { status: params.type as never } : {}),
  };

  const [records, total, pendingCount] = await Promise.all([
    db.probationRecord.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: {
          select: { id: true, empId: true, name: true, department: true },
        },
      },
    }),
    db.probationRecord.count({ where }),
    db.probationRecord.count({
      where: {
        dueDate: monthRange,
        status: { notIn: ["CONFIRMED", "EXITED"] },
        employee: { empType: "PROBATION" },
      },
    }),
  ]);

  const monthLabel = new Date(Date.UTC(year, month - 1)).toLocaleString(
    "en-IN",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  return (
    <PageShell>
      <PageHeader
        title="Probation & Confirmation"
        actions={
          <p className="text-sm text-zinc-500">
            {monthLabel}:{" "}
            <span
              className={
                pendingCount > 0 ? "font-medium text-amber-600" : "font-medium"
              }
            >
              {pendingCount} awaiting confirmation
            </span>
          </p>
        }
      />

      <div className="mt-5 md:mt-6">
        <TableFilters typeOptions={STATUS_OPTIONS} typeLabel="Status" />
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={records.length === 0}
          empty={`No probation confirmations due in ${monthLabel}.`}
        >
          {records.map((record) => (
            <ListCard
              key={record.id}
              href={`/employees/${record.employee.id}`}
              title={record.employee.name}
              subtitle={record.employee.department}
              badge={
                <Badge variant={badgeVariant[record.status]}>
                  {record.status}
                </Badge>
              }
              meta={
                <>
                  <span>{record.employee.empId}</span>
                  <span>Due {formatDay(record.dueDate)}</span>
                  {record.notes && <span>{record.notes}</span>}
                </>
              }
              actions={
                record.status === "CONFIRMED" ||
                record.status === "EXITED" ? undefined : (
                  <ProbationRowActions id={record.id} status={record.status} />
                )
              }
            />
          ))}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500">
                  No probation confirmations due in {monthLabel}.
                </TableCell>
              </TableRow>
            )}
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <Link
                    href={`/employees/${record.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {record.employee.empId}
                  </Link>
                </TableCell>
                <TableCell>{record.employee.name}</TableCell>
                <TableCell>{record.employee.department}</TableCell>
                <TableCell>{formatDay(record.dueDate)}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant[record.status]}>
                    {record.status}
                  </Badge>
                  {record.notes && (
                    <span className="ml-2 text-xs text-zinc-500">
                      {record.notes}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ProbationRowActions id={record.id} status={record.status} />
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
          pathname="/probation"
        />
      </div>
    </PageShell>
  );
}
