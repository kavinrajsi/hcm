import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import {
  optionsByCount,
  parseTableParams,
  stringParam,
} from "@/lib/table-params";
import { dayRange } from "@/lib/date-filter";
import { AddFilter } from "@/components/data-table/add-filter";
import { CountChips } from "@/components/data-table/count-chips";
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
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Probation & Confirmation" };

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "EXTENDED", label: "Extended" },
  { value: "EXITED", label: "Exited" },
] as const;

const badgeVariant = {
  PENDING: "secondary",
  CONFIRMED: "default",
  EXTENDED: "destructive",
  EXITED: "outline",
} as const;

export default async function ProbationPage({
  searchParams,
}: PageProps<"/probation">) {
  await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const status = STATUS_OPTIONS.find(
    (option) => option.value === params.type,
  )?.value;
  const department = stringParam(raw.department);
  const due = dayRange({
    preset: stringParam(raw.due),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

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
    ...(params.q || department
      ? {
          employee: {
            ...(params.q
              ? {
                  OR: [
                    { name: { contains: params.q, mode: "insensitive" } },
                    { empId: { contains: params.q, mode: "insensitive" } },
                  ],
                }
              : {}),
            ...(department ? { department } : {}),
          },
        }
      : {}),
    ...(status ? { status } : {}),
    ...(due ? { dueDate: due } : {}),
  };

  const [records, total, statuses, departments] = await Promise.all([
    db.probationRecord.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: {
          select: {
            id: true,
            empId: true,
            name: true,
            department: true,
            avatarBlobKey: true,
          },
        },
      },
    }),
    db.probationRecord.count({ where }),
    db.probationRecord.groupBy({
      by: ["status"],
      where: current,
      _count: true,
    }),
    db.employee.groupBy({
      by: ["department"],
      where: { probation: { is: current } },
      _count: true,
    }),
  ]);
  const statusCounts = new Map(
    statuses.map((group) => [group.status as string, group._count]),
  );

  return (
    <PageShell>
      <PageHeader title="Probation & Confirmation" />

      <CountChips
        items={STATUS_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          count: statusCounts.get(option.value) ?? 0,
        }))}
      />

      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center">
        <div className="min-w-0 md:flex-1">
          <AddFilter
            search={{ param: "q", hint: "Name or employee ID" }}
            fields={[
              {
                param: "type",
                label: "Status",
                options: STATUS_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  count: statusCounts.get(option.value) ?? 0,
                })),
              },
              {
                param: "department",
                label: "Department",
                options: optionsByCount(
                  departments,
                  (group) => group.department,
                ),
              },
            ]}
            date={{
              param: "due",
              label: "Due",
              presets: ["month", "year"],
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={records.length === 0}
          empty="No probation records match these filters."
        >
          {records.map((record) => (
            <ListCard
              key={record.id}
              href={`/employees/${record.employee.id}`}
              leading={
                <EmployeeAvatar
                  name={record.employee.name}
                  avatarKey={record.employee.avatarBlobKey}
                />
              }
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
                  No probation records match these filters.
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
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <EmployeeAvatar
                      name={record.employee.name}
                      avatarKey={record.employee.avatarBlobKey}
                    />
                    {record.employee.name}
                  </span>
                </TableCell>
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
