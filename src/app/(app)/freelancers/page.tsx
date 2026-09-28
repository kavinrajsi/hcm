import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
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
];

const badgeVariant = {
  AVAILABLE: "default",
  BUSY: "secondary",
  UNAVAILABLE: "destructive",
  UNKNOWN: "outline",
} as const;

export default async function FreelancersPage({
  searchParams,
}: PageProps<"/freelancers">) {
  await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // ~20k rows: every filter below hits an index; results always paginated.
  const where: Prisma.FreelancerWhereInput = {
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { skillset: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.type ? { availability: params.type as never } : {}),
  };

  const [freelancers, total] = await Promise.all([
    db.freelancer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: params.skip,
      take: params.take,
    }),
    db.freelancer.count({ where }),
  ]);

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

      <div className="mt-5 md:mt-6">
        <TableFilters
          typeOptions={AVAILABILITY_FILTER}
          typeLabel="Availability"
        />
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
                  <form action={deleteFreelancer}>
                    <input type="hidden" name="id" value={freelancer.id} />
                    <button
                      type="submit"
                      className="text-xs text-zinc-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </form>
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
