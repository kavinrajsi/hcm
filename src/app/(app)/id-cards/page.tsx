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

export const metadata = { title: "ID Cards" };

const STATUS_OPTIONS = ID_CARD_STATUSES.map(([value, label]) => ({
  value,
  label,
}));

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
    <PageShell>
      <PageHeader title="ID Card Issued List" />

      <div className="mt-5 md:mt-6">
        <TableFilters typeOptions={STATUS_OPTIONS} typeLabel="Status" />
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
              title={card.employee.name}
              subtitle={card.employee.department}
              meta={
                <>
                  <span>{card.employee.empId}</span>
                  <span>
                    Issued{" "}
                    {card.issuedAt
                      ? card.issuedAt.toISOString().slice(0, 10)
                      : "—"}
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
                <TableCell>{card.employee.name}</TableCell>
                <TableCell>{card.employee.department}</TableCell>
                <TableCell>
                  <IdCardStatusSelect id={card.id} status={card.status} />
                </TableCell>
                <TableCell>
                  {card.issuedAt
                    ? card.issuedAt.toISOString().slice(0, 10)
                    : "—"}
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
