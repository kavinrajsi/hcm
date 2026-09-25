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

export const metadata = { title: "Onboarding" };

const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CONTRACT", label: "Contract" },
];
const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((o) => [o.value, o.label]),
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
        employee: { select: { id: true, empId: true, name: true } },
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
          {records.map((r) => (
            <ListCard
              key={r.id}
              href={`/employees/${r.employee.id}`}
              title={r.employee.name}
              subtitle={r.designation}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {EMP_TYPE_LABELS[r.empType] ?? r.empType}
                </span>
              }
              meta={
                <>
                  <span>{r.employee.empId}</span>
                  <span>Joined {r.joinDate.toISOString().slice(0, 10)}</span>
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
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.employee.empId}
                  </Link>
                </TableCell>
                <TableCell>{r.employee.name}</TableCell>
                <TableCell>{r.joinDate.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{r.designation}</TableCell>
                <TableCell>{r.empType}</TableCell>
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
