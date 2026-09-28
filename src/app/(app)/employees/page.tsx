import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
import { dayRange } from "@/lib/date-filter";
import { TableFilters } from "@/components/data-table/filters";
import { AddFilter } from "@/components/data-table/add-filter";
import { TablePagination } from "@/components/data-table/pagination";
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
import { BulkImportForm } from "@/components/bulk-import-form";
import { EMPLOYEE_IMPORT_COLUMNS } from "@/lib/import-columns";
import { importEmployees } from "./actions";
import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format-date";

export const metadata = { title: "Employees" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CONTRACT", label: "Contract" },
];
const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

/** Internship / contract end, or probation confirmation due. */
function typeEnds(employee: {
  empType: string;
  empTypeEndsOn: Date | null;
  probation: { dueDate: Date } | null;
}): Date | null {
  if (employee.empType === "PROBATION")
    return employee.probation?.dueDate ?? null;
  if (employee.empType === "INTERN" || employee.empType === "CONTRACT") {
    return employee.empTypeEndsOn;
  }
  return null;
}

export default async function EmployeesPage({
  searchParams,
}: PageProps<"/employees">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const trimmedParam = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 200)
      : undefined;
  const empType = EMP_TYPE_OPTIONS.find(
    (option) => option.value === params.type,
  )?.value;
  const department = trimmedParam(raw.department);
  const designation = trimmedParam(raw.designation);
  const joined = dayRange({
    preset: trimmedParam(raw.joined),
    from: trimmedParam(raw.from),
    to: trimmedParam(raw.to),
  });

  // Managers see only their direct reports (filter options included).
  const scope: Prisma.EmployeeWhereInput =
    user.role === "MANAGER" ? { manager: { userId: user.id } } : {};
  const where: Prisma.EmployeeWhereInput = {
    ...scope,
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
    ...(empType ? { empType: empType as never } : {}),
    ...(department ? { department } : {}),
    ...(designation ? { designation } : {}),
    ...(joined ? { dateOfJoining: joined } : {}),
  };

  const [employees, total, types, departments, designations] =
    await Promise.all([
      db.employee.findMany({
        where,
        // IDs are prefix + zero-padded number, so text order is ID order.
        orderBy: { empId: "desc" },
        skip: params.skip,
        take: params.take,
        select: {
          id: true,
          empId: true,
          name: true,
          dateOfJoining: true,
          department: true,
          designation: true,
          empType: true,
          empTypeEndsOn: true,
          probation: { select: { dueDate: true } },
        },
      }),
      db.employee.count({ where }),
      db.employee.groupBy({ by: ["empType"], where: scope, _count: true }),
      db.employee.groupBy({ by: ["department"], where: scope, _count: true }),
      db.employee.groupBy({ by: ["designation"], where: scope, _count: true }),
    ]);
  // Most common first.
  const byCount = <T extends { _count: number }>(
    rows: T[],
    key: (row: T) => string,
  ) =>
    rows
      .filter((row) => key(row).trim())
      .sort(
        (left, right) =>
          right._count - left._count || key(left).localeCompare(key(right)),
      )
      .map((row) => ({ value: key(row), count: row._count }));
  const typeCounts = new Map(
    types.map((typeGroup) => [typeGroup.empType as string, typeGroup._count]),
  );

  return (
    <PageShell>
      <PageHeader
        title="Employees"
        actions={
          <>
            <BulkImportForm
              action={importEmployees}
              columns={EMPLOYEE_IMPORT_COLUMNS}
              title="Import employees"
            />
            <Button
              nativeButton={false}
              render={<Link href="/employees/new" />}
            >
              Add employee
            </Button>
          </>
        }
      />

      {/* Phones: stacked. Desktop: search and filters in one row. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center">
        <TableFilters dateFilters={false} />
        <div className="min-w-0 md:flex-1">
          <AddFilter
            fields={[
              {
                param: "type",
                label: "Emp type",
                options: EMP_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  count: typeCounts.get(option.value) ?? 0,
                })),
              },
              {
                param: "department",
                label: "Department",
                options: byCount(departments, (group) => group.department),
              },
              {
                param: "designation",
                label: "Designation",
                options: byCount(designations, (group) => group.designation),
              },
            ]}
            date={{
              param: "joined",
              label: "Joined",
              presets: ["7d", "30d", "month", "year"],
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={employees.length === 0}
          empty="No employees found."
        >
          {employees.map((employee) => (
            <ListCard
              key={employee.id}
              href={`/employees/${employee.id}`}
              title={employee.name}
              subtitle={[employee.designation, employee.department]
                .filter(Boolean)
                .join(" · ")}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {EMP_TYPE_LABELS[employee.empType] ?? employee.empType}
                </span>
              }
              meta={
                <>
                  <span>{employee.empId}</span>
                  <span>Joined {formatDay(employee.dateOfJoining)}</span>
                  {typeEnds(employee) && (
                    <span>Ends {formatDay(typeEnds(employee))}</span>
                  )}
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
              <TableHead>Emp ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date of Joining</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Emp Type</TableHead>
              <TableHead>Type ends</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link
                    href={`/employees/${employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {employee.empId}
                  </Link>
                </TableCell>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{formatDay(employee.dateOfJoining)}</TableCell>
                <TableCell>{employee.department}</TableCell>
                <TableCell>{employee.designation}</TableCell>
                <TableCell>{employee.empType}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDay(typeEnds(employee)) || "—"}
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
          pathname="/employees"
        />
      </div>
    </PageShell>
  );
}
