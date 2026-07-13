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
import { ExitForm } from "./exit-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Exit / Offboarding" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
];

export default async function ExitPage({ searchParams }: PageProps<"/exit">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.EmployeeWhereInput = {
    dateOfExit: { not: null },
    ...(params.q
      ? { name: { contains: params.q, mode: "insensitive" } }
      : {}),
    ...(params.type ? { empType: params.type as never } : {}),
  };
  const dateRange = datePartsToRange(params);
  if (dateRange) where.dateOfExit = dateRange;

  const [exits, total, activeEmployees] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: { dateOfExit: "desc" },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        empId: true,
        name: true,
        dateOfJoining: true,
        dateOfExit: true,
        designation: true,
        empType: true,
      },
    }),
    db.employee.count({ where }),
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Exit / Offboarding
      </h1>

      <div className="mt-6">
        <ExitForm activeEmployees={activeEmployees} />
      </div>

      <div className="mt-6">
        <TableFilters typeOptions={EMP_TYPE_OPTIONS} typeLabel="Emp type" />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emp ID</TableHead>
              <TableHead>Emp Name</TableHead>
              <TableHead>Date of Joining</TableHead>
              <TableHead>Date of Exit</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Emp Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exits.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500">
                  No exits recorded.
                </TableCell>
              </TableRow>
            )}
            {exits.map((e) => (
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
                <TableCell>{e.dateOfJoining.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{e.dateOfExit?.toISOString().slice(0, 10)}</TableCell>
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
          pathname="/exit"
        />
      </div>
    </main>
  );
}
