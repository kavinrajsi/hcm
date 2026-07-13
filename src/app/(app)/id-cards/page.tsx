import Link from "next/link";
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
import { IdCardStatusSelect } from "./status-select";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "ID Cards" };

const STATUS_OPTIONS = [
  { value: "PHOTO_TAKEN", label: "Photo Taken" },
  { value: "CORRECTION", label: "Correction" },
  { value: "PENDING", label: "Pending" },
  { value: "ISSUED", label: "Issued" },
  { value: "RETURN_PENDING", label: "Return Pending" },
  { value: "RETURNED", label: "Returned" },
];

export default async function IdCardsPage({
  searchParams,
}: PageProps<"/id-cards">) {
  await requireRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  const where: Prisma.IdCardWhereInput = {
    ...(params.q
      ? { employee: { name: { contains: params.q, mode: "insensitive" } } }
      : {}),
    ...(params.type ? { status: params.type as never } : {}),
  };

  const [cards, total] = await Promise.all([
    db.idCard.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: params.skip,
      take: params.take,
      include: {
        employee: {
          select: { id: true, empId: true, name: true, department: true },
        },
      },
    }),
    db.idCard.count({ where }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        ID Card Issued List
      </h1>

      <div className="mt-6">
        <TableFilters typeOptions={STATUS_OPTIONS} typeLabel="Status" />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
            {cards.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/employees/${c.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {c.employee.empId}
                  </Link>
                </TableCell>
                <TableCell>{c.employee.name}</TableCell>
                <TableCell>{c.employee.department}</TableCell>
                <TableCell>
                  <IdCardStatusSelect id={c.id} status={c.status} />
                </TableCell>
                <TableCell>
                  {c.issuedAt ? c.issuedAt.toISOString().slice(0, 10) : "—"}
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
          pathname="/id-cards"
        />
      </div>
    </main>
  );
}
