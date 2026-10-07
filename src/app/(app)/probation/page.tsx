import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { teamEmployeeWhere } from "@/lib/team-scope";
import {
  listParam,
  optionsByCount,
  parseTableParams,
  stringParam,
} from "@/lib/table-params";
import { dayRange } from "@/lib/date-filter";
import {
  FilterDateRange,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/data-table/filter-bar";
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
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const isHr = user.role === "HR_ADMIN";
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Multi-selects arrive as repeated params (?type=PENDING&type=EXTENDED);
  // unknown statuses are ignored.
  const typeParam = listParam(raw.type);
  const statuses = STATUS_OPTIONS.map((option) => option.value).filter(
    (value) => typeParam.includes(value),
  );
  const departments = listParam(raw.department);
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
  // Managers see only their direct reports.
  const team = teamEmployeeWhere(user);
  const where: Prisma.ProbationRecordWhereInput = {
    ...current,
    AND: [{ employee: team }],
    ...(params.q || departments.length
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
            ...(departments.length ? { department: { in: departments } } : {}),
          },
        }
      : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(due ? { dueDate: due } : {}),
  };

  const [records, total, statusGroups, departmentGroups] = await Promise.all([
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
      where: { ...current, AND: [{ employee: team }] },
      _count: true,
    }),
    db.employee.groupBy({
      by: ["department"],
      where: { probation: { is: current }, ...team },
      _count: true,
    }),
  ]);
  const statusCounts = new Map(
    statusGroups.map((group) => [group.status as string, group._count]),
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

      {/* Row 1: one search across everything. Row 2: the filters. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search name or employee ID" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            <FilterDateRange param="due" presets={["month", "year"]} />
            <FilterMultiSelect
              param="type"
              label="Status"
              plural="Statuses"
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                count: statusCounts.get(option.value) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="department"
              label="Department"
              plural="Departments"
              options={optionsByCount(departmentGroups, (group) => group.department)}
              searchable
            />
          </div>
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
              href={isHr ? `/employees/${record.employee.id}` : undefined}
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
                !isHr ||
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
                  {isHr ? (
                    <Link
                      href={`/employees/${record.employee.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {record.employee.empId}
                    </Link>
                  ) : (
                    <span className="font-medium">{record.employee.empId}</span>
                  )}
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
                  {isHr && (
                    <ProbationRowActions
                      id={record.id}
                      status={record.status}
                    />
                  )}
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
