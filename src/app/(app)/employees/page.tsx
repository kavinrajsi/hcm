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

export default async function EmployeesPage({
  searchParams,
}: PageProps<"/employees">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.EmployeeWhereInput = {
    // Managers see only their direct reports.
    ...(user.role === "MANAGER"
      ? { manager: { userId: user.id } }
      : {}),
    ...(params.q
      ? { name: { contains: params.q, mode: "insensitive" } }
      : {}),
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <div className="flex items-center gap-2">
          <BulkImportForm
            action={importEmployees}
            columns={EMPLOYEE_IMPORT_COLUMNS}
            title="Import employees"
          />
          <Button render={<Link href="/employees/new" />}>Add employee</Button>
        </div>
      </div>

      <div className="mt-6">
        <TableFilters typeOptions={EMP_TYPE_OPTIONS} typeLabel="Emp type" />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
      </div>

      <div className="mt-4">
        <TablePagination
          page={params.page}
          total={total}
          searchParams={raw}
          pathname="/employees"
        />
      </div>
    </main>
  );
}
