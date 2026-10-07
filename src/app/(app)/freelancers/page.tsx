import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { listParam, parseTableParams, stringParam } from "@/lib/table-params";
import { instantRange } from "@/lib/date-filter";
import {
  FilterDateRange,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/data-table/filter-bar";
import { TablePagination } from "@/components/data-table/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { CollapsibleForm } from "@/components/collapsible-form";
import { DeleteIcon } from "@/components/icons";
import { FreelancerAddForm } from "./freelancer-forms";
import { deleteFreelancer, importFreelancers } from "./actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { FREELANCER_IMPORT_COLUMNS } from "@/lib/import-columns";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Freelance Resource Pool" };

const AVAILABILITY_FILTER = [
  { value: "AVAILABLE", label: "Available" },
  { value: "BUSY", label: "Busy" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

const badgeVariant = {
  AVAILABLE: "default",
  BUSY: "secondary",
  UNAVAILABLE: "destructive",
  UNKNOWN: "outline",
} as const;

export default async function FreelancersPage({
  searchParams,
}: PageProps<"/freelancers">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const isHr = user.role === "HR_ADMIN";
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Repeated ?type= params; unknown availabilities are ignored.
  const typeValues = listParam(raw.type);
  const availabilities = AVAILABILITY_FILTER.filter((option) =>
    typeValues.includes(option.value),
  ).map((option) => option.value);
  const added = instantRange({
    preset: stringParam(raw.added),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // ~20k rows: search and availability hit indexes; createdAt has none, but a
  // range scan over 20k rows is still cheap and results are always paginated.
  const where: Prisma.FreelancerWhereInput = {
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { skillset: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(availabilities.length ? { availability: { in: availabilities } } : {}),
    ...(added ? { createdAt: added } : {}),
  };

  const [freelancers, total, availabilityGroups] = await Promise.all([
    db.freelancer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: params.skip,
      take: params.take,
    }),
    db.freelancer.count({ where }),
    // Indexed enum, so cheap even across the whole pool.
    db.freelancer.groupBy({ by: ["availability"], _count: true }),
  ]);
  const availabilityCounts = new Map(
    availabilityGroups.map((group) => [
      group.availability as string,
      group._count,
    ]),
  );

  return (
    <PageShell>
      <PageHeader
        title="Freelance Resource Pool"
        actions={
          <BulkImportForm
            action={importFreelancers}
            columns={FREELANCER_IMPORT_COLUMNS}
            title="Import freelancers"
          />
        }
      />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="Add freelancer">
          <FreelancerAddForm />
        </CollapsibleForm>
      </div>

      {/* Row 1: one search across everything. Row 2: the filters. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search name or skillset" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            <FilterDateRange
              param="added"
              presets={["7d", "30d", "month", "year"]}
              withTime
            />
            <FilterMultiSelect
              param="type"
              label="Availability"
              plural="Availabilities"
              options={AVAILABILITY_FILTER.map((option) => ({
                value: option.value,
                label: option.label,
                count: availabilityCounts.get(option.value) ?? 0,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <MobileList
          isEmpty={freelancers.length === 0}
          empty="No freelancers found."
        >
          {freelancers.map((freelancer) => (
            <ListCard
              key={freelancer.id}
              title={freelancer.name}
              subtitle={
                <>
                  {freelancer.skillset}
                  {freelancer.notes && (
                    <span className="mt-1 line-clamp-3 block">
                      {freelancer.notes}
                    </span>
                  )}
                </>
              }
              badge={
                <Badge variant={badgeVariant[freelancer.availability]}>
                  {freelancer.availability}
                </Badge>
              }
              meta={
                <>
                  {freelancer.email && (
                    <span className="break-all">{freelancer.email}</span>
                  )}
                  {freelancer.phone && <span>{freelancer.phone}</span>}
                  {freelancer.rate && <span>Rate {freelancer.rate}</span>}
                </>
              }
              actions={
                isHr && (
                  <form action={deleteFreelancer} className="ml-auto">
                    <input type="hidden" name="id" value={freelancer.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      className="h-10 text-zinc-500 active:text-red-600"
                    >
                      <DeleteIcon className="size-4" />
                      Delete
                    </Button>
                  </form>
                )
              }
            />
          ))}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Skillset</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {freelancers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  No freelancers found.
                </TableCell>
              </TableRow>
            )}
            {freelancers.map((freelancer) => (
              <TableRow key={freelancer.id}>
                <TableCell className="font-medium">{freelancer.name}</TableCell>
                <TableCell className="text-sm">
                  {[freelancer.email, freelancer.phone]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </TableCell>
                <TableCell>{freelancer.skillset}</TableCell>
                <TableCell>{freelancer.rate ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant[freelancer.availability]}>
                    {freelancer.availability}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {freelancer.notes ?? "—"}
                </TableCell>
                <TableCell>
                  {isHr && (
                    <form action={deleteFreelancer}>
                      <input type="hidden" name="id" value={freelancer.id} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </form>
                  )}
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
          pathname="/freelancers"
        />
      </div>
    </PageShell>
  );
}
