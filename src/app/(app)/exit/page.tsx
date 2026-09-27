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
import { CollapsibleForm } from "@/components/collapsible-form";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { ExitForm } from "./exit-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Exit / Offboarding" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CONTRACT", label: "Contract" },
];
const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default async function ExitPage({ searchParams }: PageProps<"/exit">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.EmployeeWhereInput = {
    dateOfExit: { not: null },
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
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
    <PageShell>
      <PageHeader title="Exit / Offboarding" />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="Record exit">
          <ExitForm activeEmployees={activeEmployees} />
        </CollapsibleForm>
      </div>

      <div className="mt-5 md:mt-6">
        <TableFilters typeOptions={EMP_TYPE_OPTIONS} typeLabel="Emp type" />
      </div>

      <div className="mt-4">
        <MobileList isEmpty={exits.length === 0} empty="No exits recorded.">
          {exits.map((e) => (
            <ListCard
              key={e.id}
              href={`/employees/${e.id}`}
              title={e.name}
              subtitle={e.designation}
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
                  <span>Exited {e.dateOfExit?.toISOString().slice(0, 10)}</span>
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
                <TableCell>
                  {e.dateOfJoining.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  {e.dateOfExit?.toISOString().slice(0, 10)}
                </TableCell>
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
          pathname="/exit"
        />
      </div>
    </PageShell>
  );
}
