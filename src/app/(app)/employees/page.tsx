import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
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
import { EmployeeAvatar } from "@/components/employee-avatar";
import { BasecampSyncButton } from "./basecamp-sync";
import { EMP_TYPE_LABELS, EMP_TYPE_OPTIONS } from "@/lib/emp-type";

export const metadata = { title: "Employees" };

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

  const empType = EMP_TYPE_OPTIONS.find(
    (option) => option.value === params.type,
  )?.value;
  const department = stringParam(raw.department);
  const designation = stringParam(raw.designation);
  const joined = dayRange({
    preset: stringParam(raw.joined),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // Managers see only their direct reports (filter options included).
  const scope: Prisma.EmployeeWhereInput =
    user.role === "MANAGER" ? { manager: { userId: user.id } } : {};
  const where: Prisma.EmployeeWhereInput = {
    ...scope,
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { empId: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(empType ? { empType: empType as never } : {}),
    ...(department ? { department } : {}),
    ...(designation ? { designation } : {}),
    ...(joined ? { dateOfJoining: joined } : {}),
  };

  const [matchedTypes, types, departments, designations] = await Promise.all([
    db.employee.groupBy({ by: ["empType"], where, _count: true }),
    db.employee.groupBy({ by: ["empType"], where: scope, _count: true }),
    db.employee.groupBy({ by: ["department"], where: scope, _count: true }),
    db.employee.groupBy({ by: ["designation"], where: scope, _count: true }),
  ]);
  const matchedCounts = new Map(
    matchedTypes.map((group) => [group.empType as string, group._count]),
  );
  const total = matchedTypes.reduce((sum, group) => sum + group._count, 0);

  // The enum's database order isn't the display order, so page through
  // the types one by one: each type's slice of [skip, skip + take).
  const pageEnd = params.skip + params.take;
  const slices: { empType: string; skip: number; take: number }[] = [];
  let typeStart = 0;
  for (const { value } of EMP_TYPE_OPTIONS) {
    const count = matchedCounts.get(value) ?? 0;
    const from = Math.max(params.skip, typeStart);
    const to = Math.min(pageEnd, typeStart + count);
    if (to > from) {
      slices.push({ empType: value, skip: from - typeStart, take: to - from });
    }
    typeStart += count;
  }
  const employees = (
    await Promise.all(
      slices.map((slice) =>
        db.employee.findMany({
          where: { ...where, empType: slice.empType as never },
          // Newest joiners first; IDs are prefix + zero-padded number.
          orderBy: [{ dateOfJoining: "desc" }, { empId: "desc" }],
          skip: slice.skip,
          take: slice.take,
          select: {
            id: true,
            empId: true,
            name: true,
            dateOfJoining: true,
            department: true,
            designation: true,
            empType: true,
            empTypeEndsOn: true,
            avatarBlobKey: true,
            probation: { select: { dueDate: true } },
          },
        }),
      ),
    )
  ).flat();
  const typeCounts = new Map(
    types.map((typeGroup) => [typeGroup.empType as string, typeGroup._count]),
  );

  return (
    <PageShell>
      <PageHeader
        title="Employees"
        actions={
          <>
            {user.role === "HR_ADMIN" && <BasecampSyncButton />}
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

      <CountChips
        items={EMP_TYPE_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          count: typeCounts.get(option.value) ?? 0,
        }))}
      />

      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center">
        <div className="min-w-0 md:flex-1">
          <AddFilter
            search={{ param: "q", hint: "Name or employee ID" }}
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
                options: optionsByCount(
                  departments,
                  (group) => group.department,
                ),
              },
              {
                param: "designation",
                label: "Designation",
                options: optionsByCount(
                  designations,
                  (group) => group.designation,
                ),
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
              leading={
                <EmployeeAvatar
                  name={employee.name}
                  avatarKey={employee.avatarBlobKey}
                />
              }
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
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <EmployeeAvatar
                      name={employee.name}
                      avatarKey={employee.avatarBlobKey}
                    />
                    {employee.name}
                  </span>
                </TableCell>
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
