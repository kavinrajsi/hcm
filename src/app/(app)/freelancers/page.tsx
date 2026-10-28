import Link from "next/link";
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
import { DeleteIcon } from "@/components/icons";
import { AddFreelancerSheet, FreelancerDetailSheet } from "./freelancer-sheets";
import { toFreelancerDetail } from "./detail";
import { WORK_MODE_LABELS, WORK_MODES } from "./freelancer-rules";
import { deleteFreelancer, importFreelancers } from "./actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { FREELANCER_IMPORT_COLUMNS } from "@/lib/import-columns";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Freelances" };

const badgeVariant = {
  REMOTE: "default",
  ONSITE: "secondary",
  FLEXIBLE: "outline",
} as const;

export default async function FreelancersPage({
  searchParams,
}: PageProps<"/freelancers">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const isHr = user.role === "HR_ADMIN";
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const openId = stringParam(raw.freelancer);

  // Repeated ?type= params (Remote, Onsite, Flexible); unknown values are ignored.
  const typeValues = listParam(raw.type);
  const workModes = WORK_MODES.filter((mode) => typeValues.includes(mode.value)).map((mode) => mode.value);
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
    ...(workModes.length ? { workMode: { in: workModes } } : {}),
    ...(added ? { createdAt: added } : {}),
  };

  const [freelancers, total, availabilityGroups, opened] = await Promise.all([
    db.freelancer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: params.skip,
      take: params.take,
    }),
    db.freelancer.count({ where }),
    // Indexed enum, so cheap even across the whole pool.
    db.freelancer.groupBy({ by: ["workMode"], _count: true }),
    openId
      ? db.freelancer.findUnique({ where: { id: openId } })
      : Promise.resolve(null),
  ]);
  const availabilityCounts = new Map(
    availabilityGroups.map((group) => [
      group.workMode as string,
      group._count,
    ]),
  );

  return (
    <PageShell>
      <PageHeader
        title="Freelances"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BulkImportForm
              action={importFreelancers}
              columns={FREELANCER_IMPORT_COLUMNS}
              title="Import freelancers"
            />
            <AddFreelancerSheet />
          </div>
        }
      />

      {opened && (
        <FreelancerDetailSheet
          closeHref={pageHref(raw, { freelancer: null })}
          freelancer={toFreelancerDetail(opened)}
        />
      )}

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
              label="Status"
              plural="Statuses"
              options={WORK_MODES.map((mode) => ({
                value: mode.value,
                label: mode.label,
                count: availabilityCounts.get(mode.value) ?? 0,
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
              href={pageHref(raw, { freelancer: freelancer.id })}
              title={freelancer.name}
              subtitle={freelancer.designation ?? freelancer.skillset}
              badge={
                freelancer.workMode ? (
                  <Badge variant={badgeVariant[freelancer.workMode]}>
                    {WORK_MODE_LABELS[freelancer.workMode]}
                  </Badge>
                ) : null
              }
              meta={
                <>
                  {freelancer.email && (
                    <span className="break-all">{freelancer.email}</span>
                  )}
                  {freelancer.phone && <span>{freelancer.phone}</span>}
                  <span>{freelancer.skillset}</span>
                  {freelancer.profileUrl && (
                    <a
                      href={freelancer.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline-offset-4 hover:underline"
                    >
                      Profile
                    </a>
                  )}
                </>
              }
              actions={
                isHr && (
                  <form action={deleteFreelancer} className="ml-auto">
                    <input type="hidden" name="id" value={freelancer.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete freelancer"
                      title="Delete"
                      className="size-10 text-zinc-500 active:text-red-600"
                    >
                      <DeleteIcon className="size-4" />
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
              <TableHead>Designation</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Skillset</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell className="font-medium">
                  <Link
                    href={pageHref(raw, { freelancer: freelancer.id })}
                    className="underline-offset-4 hover:underline"
                  >
                    {freelancer.name}
                  </Link>
                </TableCell>
                <TableCell>{freelancer.designation ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {[freelancer.email, freelancer.phone]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </TableCell>
                <TableCell>{freelancer.skillset}</TableCell>
                <TableCell>
                  {freelancer.profileUrl ? (
                    <a
                      href={freelancer.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {freelancer.workMode ? (
                    <Badge variant={badgeVariant[freelancer.workMode]}>
                      {WORK_MODE_LABELS[freelancer.workMode]}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {isHr && (
                    <form action={deleteFreelancer}>
                      <input type="hidden" name="id" value={freelancer.id} />
                      <button
                        type="submit"
                        aria-label="Delete freelancer"
                        title="Delete"
                        className="rounded p-1.5 text-zinc-400 hover:text-red-600"
                      >
                        <DeleteIcon className="size-4" />
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

/** Current list URL with some params replaced (null removes one). */
function pageHref(
  raw: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key in patch || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/freelancers?${query}` : "/freelancers";
}
