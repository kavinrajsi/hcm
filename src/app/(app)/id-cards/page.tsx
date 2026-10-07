import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import {
  listParam,
  optionsByCount,
  parseTableParams,
  stringParam,
} from "@/lib/table-params";
import { instantRange } from "@/lib/date-filter";
import {
  FilterDateRange,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/data-table/filter-bar";
import { CountChips } from "@/components/data-table/count-chips";
import { ID_CARD_CHIPS } from "@/lib/chip-tones";
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
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { ID_CARD_STATUSES } from "@/lib/id-card-status";
import { IdCardStatusSelect } from "./status-select";
import type { Prisma } from "@/generated/prisma/client";
import { formatInstantDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";

export const metadata = { title: "ID Cards" };

const STATUS_OPTIONS = ID_CARD_STATUSES.map(([value, label]) => ({
  value,
  label,
}));

export default async function IdCardsPage({
  searchParams,
}: PageProps<"/id-cards">) {
  await requirePageRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Multi-selects arrive as repeated params; unknown statuses are ignored.
  const statusValues = listParam(raw.type);
  const statuses = STATUS_OPTIONS.filter((option) =>
    statusValues.includes(option.value),
  ).map((option) => option.value);
  const departments = listParam(raw.department);
  const updated = instantRange({
    preset: stringParam(raw.updated),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });
  const where: Prisma.IdCardWhereInput = {
    ...(params.q || departments.length
      ? {
          employee: {
            ...(params.q
              ? {
                  OR: [
                    { name: { contains: params.q, mode: "insensitive" } },
                    { empId: { contains: params.q, mode: "insensitive" } },
                  ],
                }
              : {}),
            ...(departments.length ? { department: { in: departments } } : {}),
          },
        }
      : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(updated ? { updatedAt: updated } : {}),
  };

  const [cards, total, statusGroups, departmentGroups] = await Promise.all([
    db.idCard.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: {
          select: {
            id: true,
            empId: true,
            name: true,
            department: true,
            avatarBlobKey: true,
          },
        },
      },
    }),
    db.idCard.count({ where }),
    db.idCard.groupBy({ by: ["status"], _count: true }),
    db.employee.groupBy({
      by: ["department"],
      where: { idCard: { isNot: null } },
      _count: true,
    }),
  ]);
  const statusCounts = new Map(
    statusGroups.map((group) => [group.status as string, group._count]),
  );

  return (
    <PageShell>
      <PageHeader title="ID Card Issued List" />

      <CountChips
        items={STATUS_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          count: statusCounts.get(option.value) ?? 0,
          className: ID_CARD_CHIPS[option.value],
        }))}
      />

      {/* Row 1: one search across everything. Row 2: the filters. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search name or employee ID" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            <FilterDateRange
              param="updated"
              presets={["7d", "30d", "month"]}
              withTime
            />
            <FilterMultiSelect
              param="type"
              label="Status"
              plural="Statuses"
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                count: statusCounts.get(option.value) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="department"
              label="Department"
              plural="Departments"
              options={optionsByCount(
                departmentGroups,
                (group) => group.department,
              )}
              searchable
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={cards.length === 0}
          empty="No ID card records found."
        >
          {cards.map((card) => (
            <ListCard
              key={card.id}
              href={`/employees/${card.employee.id}`}
              leading={
                <EmployeeAvatar
                  name={card.employee.name}
                  avatarKey={card.employee.avatarBlobKey}
                />
              }
              title={card.employee.name}
              subtitle={card.employee.department}
              meta={
                <>
                  <span>{card.employee.empId}</span>
                  <span>
                    Issued{" "}
                    {card.issuedAt ? formatInstantDay(card.issuedAt) : "—"}
                  </span>
                </>
              }
              actions={<IdCardStatusSelect id={card.id} status={card.status} />}
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
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500">
                  No ID card records found.
                </TableCell>
              </TableRow>
            )}
            {cards.map((card) => (
              <TableRow key={card.id}>
                <TableCell>
                  <Link
                    href={`/employees/${card.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {card.employee.empId}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <EmployeeAvatar
                      name={card.employee.name}
                      avatarKey={card.employee.avatarBlobKey}
                    />
                    {card.employee.name}
                  </span>
                </TableCell>
                <TableCell>{card.employee.department}</TableCell>
                <TableCell>
                  <IdCardStatusSelect id={card.id} status={card.status} />
                </TableCell>
                <TableCell>
                  {card.issuedAt ? formatInstantDay(card.issuedAt) : "—"}
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
          pathname="/id-cards"
        />
      </div>
    </PageShell>
  );
}
