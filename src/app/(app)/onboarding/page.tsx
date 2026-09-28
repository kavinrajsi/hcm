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
import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "Onboarding" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CONTRACT", label: "Contract" },
];
const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.OnboardingRecordWhereInput = {
    ...(params.q
      ? { employee: { name: { contains: params.q, mode: "insensitive" } } }
      : {}),
    ...(params.type ? { empType: params.type as never } : {}),
  };
  const dateRange = datePartsToRange(params);
  if (dateRange) where.joinDate = dateRange;

  const [records, total] = await Promise.all([
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
  ]);

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

      <div className="mt-5 md:mt-6">
        <TableFilters typeOptions={EMP_TYPE_OPTIONS} typeLabel="Emp type" />
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
