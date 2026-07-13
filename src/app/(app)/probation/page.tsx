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
import { ProbationRowActions } from "./probation-row-actions";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Probation & Confirmation" };

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "EXTENDED", label: "Extended" },
];

const badgeVariant = {
  PENDING: "secondary",
  CONFIRMED: "default",
  EXTENDED: "destructive",
} as const;

export default async function ProbationPage({
  searchParams,
}: PageProps<"/probation">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Default view: due this month (or the month/year picked in filters).
  const now = new Date();
  const y = params.year ?? now.getUTCFullYear();
  const m = params.month ?? now.getUTCMonth() + 1;
  const monthRange = {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };

  const where: Prisma.ProbationRecordWhereInput = {
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
      where: { dueDate: monthRange, status: { not: "CONFIRMED" } },
    }),
  ]);

  const monthLabel = new Date(Date.UTC(y, m - 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Probation & Confirmation
        </h1>
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
      </div>

      <div className="mt-6">
        <TableFilters typeOptions={STATUS_OPTIONS} typeLabel="Status" />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.employee.empId}
                  </Link>
                </TableCell>
                <TableCell>{r.employee.name}</TableCell>
                <TableCell>{r.employee.department}</TableCell>
                <TableCell>{r.dueDate.toISOString().slice(0, 10)}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant[r.status]}>{r.status}</Badge>
                  {r.notes && (
                    <span className="ml-2 text-xs text-zinc-500">{r.notes}</span>
                  )}
                </TableCell>
                <TableCell>
                  <ProbationRowActions id={r.id} status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4">
        <TablePagination
          page={params.page}
          total={total}
          searchParams={raw}
          pathname="/probation"
        />
      </div>
    </main>
  );
}
