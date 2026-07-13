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
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Freelance Resource Pool
        </h1>
        <BulkImportForm
          action={importFreelancers}
          columns={FREELANCER_IMPORT_COLUMNS}
          title="Import freelancers"
        />
      </div>

      <div className="mt-6">
        <FreelancerAddForm />
      </div>

      <div className="mt-6">
        <TableFilters
          typeOptions={AVAILABILITY_FILTER}
          typeLabel="Availability"
        />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
            {freelancers.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-sm">
                  {[f.email, f.phone].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>{f.skillset}</TableCell>
                <TableCell>{f.rate ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant[f.availability]}>
                    {f.availability}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {f.notes ?? "—"}
                </TableCell>
                <TableCell>
                  <form action={deleteFreelancer}>
                    <input type="hidden" name="id" value={f.id} />
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
      </div>

      <div className="mt-4">
        <TablePagination
          page={params.page}
          total={total}
          searchParams={raw}
          pathname="/freelancers"
        />
      </div>
    </main>
  );
}
