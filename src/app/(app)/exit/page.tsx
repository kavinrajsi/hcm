import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { teamEmployeeWhere } from "@/lib/team-scope";
import {
  optionsByCount,
  parseTableParams,
  stringParam,
} from "@/lib/table-params";
import { dayRange } from "@/lib/date-filter";
import { AddFilter } from "@/components/data-table/add-filter";
import { CountChips } from "@/components/data-table/count-chips";
import { EMP_TYPE_LABELS, EMP_TYPE_OPTIONS } from "@/lib/emp-type";
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
import { formatDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Exit / Offboarding" };

export default async function ExitPage({ searchParams }: PageProps<"/exit">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const isHr = user.role === "HR_ADMIN";
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const empType = EMP_TYPE_OPTIONS.find(
    (option) => option.value === params.type,
  )?.value;
  const designation = stringParam(raw.designation);
  const exited = dayRange({
    preset: stringParam(raw.exited),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });
  // Managers see only their direct reports.
  const team = teamEmployeeWhere(user);
  const scope: Prisma.EmployeeWhereInput = { dateOfExit: { not: null }, AND: [team] };
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
    ...(empType ? { empType } : {}),
    ...(designation ? { designation } : {}),
    ...(exited ? { dateOfExit: { not: null, ...exited } } : {}),
  };

  const [exits, total, activeEmployees, types, designations] =
    await Promise.all([
      db.employee.findMany({
        where,
        orderBy: { dateOfExit: "desc" },
        skip: params.skip,
        take: params.take,
        select: {
          id: true,
          empId: true,
          name: true,
          avatarBlobKey: true,
          dateOfJoining: true,
          dateOfExit: true,
          designation: true,
          empType: true,
        },
      }),
      db.employee.count({ where }),
      db.employee.findMany({
        where: { dateOfExit: null, ...team },
        orderBy: { name: "asc" },
        select: { id: true, empId: true, name: true },
      }),
      db.employee.groupBy({ by: ["empType"], where: scope, _count: true }),
      db.employee.groupBy({ by: ["designation"], where: scope, _count: true }),
    ]);
  const typeCounts = new Map(
    types.map((group) => [group.empType as string, group._count]),
  );

  return (
    <PageShell>
      <PageHeader title="Exit / Offboarding" />

      {isHr && (
        <div className="mt-5 md:mt-6">
          <CollapsibleForm label="Record exit">
            <ExitForm activeEmployees={activeEmployees} />
          </CollapsibleForm>
        </div>
      )}

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
                param: "designation",
                label: "Designation",
                options: optionsByCount(
                  designations,
                  (group) => group.designation,
                ),
              },
            ]}
            date={{
              param: "exited",
              label: "Exited",
              presets: ["30d", "month", "year"],
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <MobileList isEmpty={exits.length === 0} empty="No exits recorded.">
          {exits.map((exitedEmployee) => (
            <ListCard
              key={exitedEmployee.id}
              href={isHr ? `/employees/${exitedEmployee.id}` : undefined}
              leading={
                <EmployeeAvatar
                  name={exitedEmployee.name}
                  avatarKey={exitedEmployee.avatarBlobKey}
                />
              }
              title={exitedEmployee.name}
              subtitle={exitedEmployee.designation}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {EMP_TYPE_LABELS[exitedEmployee.empType] ??
                    exitedEmployee.empType}
                </span>
              }
              meta={
                <>
                  <span>{exitedEmployee.empId}</span>
                  <span>Joined {formatDay(exitedEmployee.dateOfJoining)}</span>
                  <span>Exited {formatDay(exitedEmployee.dateOfExit)}</span>
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
            {exits.map((exitedEmployee) => (
              <TableRow key={exitedEmployee.id}>
                <TableCell>
                  {isHr ? (
                    <Link
                      href={`/employees/${exitedEmployee.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {exitedEmployee.empId}
                    </Link>
                  ) : (
                    <span className="font-medium">{exitedEmployee.empId}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <EmployeeAvatar
                      name={exitedEmployee.name}
                      avatarKey={exitedEmployee.avatarBlobKey}
                    />
                    {exitedEmployee.name}
                  </span>
                </TableCell>
                <TableCell>{formatDay(exitedEmployee.dateOfJoining)}</TableCell>
                <TableCell>{formatDay(exitedEmployee.dateOfExit)}</TableCell>
                <TableCell>{exitedEmployee.designation}</TableCell>
                <TableCell>{exitedEmployee.empType}</TableCell>
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
