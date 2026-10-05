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
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const empType = EMP_TYPE_OPTIONS.find(
    (option) => option.value === params.type,
  )?.value;
  const designation = stringParam(raw.designation);
  const joined = dayRange({
    preset: stringParam(raw.joined),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });
  // Managers see only their direct reports.
  const team = teamEmployeeWhere(user);
  const where: Prisma.OnboardingRecordWhereInput = {
    AND: [{ employee: team }],
    ...(params.q
      ? {
          employee: {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { empId: { contains: params.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(empType ? { empType } : {}),
    ...(designation ? { designation } : {}),
    ...(joined ? { joinDate: joined } : {}),
  };

  const [records, total, types, designations] = await Promise.all([
    db.onboardingRecord.findMany({
      where,
      orderBy: { joinDate: "desc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: {
          select: { id: true, empId: true, name: true, avatarBlobKey: true },
        },
      },
    }),
    db.onboardingRecord.count({ where }),
    db.onboardingRecord.groupBy({ by: ["empType"], where: { employee: team }, _count: true }),
    db.onboardingRecord.groupBy({ by: ["designation"], where: { employee: team }, _count: true }),
  ]);
  const typeCounts = new Map(
    types.map((group) => [group.empType as string, group._count]),
  );

  return (
    <PageShell>
      <PageHeader
        title="Onboarding"
        actions={
          <Button nativeButton={false} render={<Link href="/employees/new" />}>
            New joiner
          </Button>
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
          isEmpty={records.length === 0}
          empty="No onboarding records found."
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
              subtitle={record.designation}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {EMP_TYPE_LABELS[record.empType] ?? record.empType}
                </span>
              }
              meta={
                <>
                  <span>{record.employee.empId}</span>
                  <span>Joined {formatDay(record.joinDate)}</span>
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
              <TableHead>Designation</TableHead>
              <TableHead>Emp Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500">
                  No onboarding records found.
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
                <TableCell>{formatDay(record.joinDate)}</TableCell>
                <TableCell>{record.designation}</TableCell>
                <TableCell>{record.empType}</TableCell>
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
          pathname="/onboarding"
        />
      </div>
    </PageShell>
  );
}
