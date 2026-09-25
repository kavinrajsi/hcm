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

export const metadata = { title: "Employees" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
];
const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default async function EmployeesPage({
  searchParams,
}: PageProps<"/employees">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.EmployeeWhereInput = {
    // Managers see only their direct reports.
    ...(user.role === "MANAGER" ? { manager: { userId: user.id } } : {}),
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
    ...(params.type ? { empType: params.type as never } : {}),
  };
  const dateRange = datePartsToRange(params);
  if (dateRange) where.dateOfJoining = dateRange;

  const [employees, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: { dateOfJoining: "desc" },
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
      },
    }),
    db.employee.count({ where }),
  ]);

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

      <div className="mt-5 md:mt-6">
        <TableFilters typeOptions={EMP_TYPE_OPTIONS} typeLabel="Emp type" />
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={employees.length === 0}
          empty="No employees found."
        >
          {employees.map((e) => (
            <ListCard
              key={e.id}
              href={`/employees/${e.id}`}
              title={e.name}
              subtitle={[e.designation, e.department]
                .filter(Boolean)
                .join(" · ")}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {EMP_TYPE_LABELS[e.empType] ?? e.empType}
                </span>
              }
              meta={
                <>
                  <span>{e.empId}</span>
                  <span>
                    Joined {e.dateOfJoining.toISOString().slice(0, 10)}
                  </span>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
            {employees.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link
                    href={`/employees/${e.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {e.empId}
                  </Link>
                </TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell>
                  {e.dateOfJoining.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>{e.department}</TableCell>
                <TableCell>{e.designation}</TableCell>
                <TableCell>{e.empType}</TableCell>
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
