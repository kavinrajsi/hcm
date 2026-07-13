import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  basecampConfigured,
  getAccessToken,
  listProjects,
} from "@/lib/basecamp";
import { parseTableParams } from "@/lib/table-params";
import { TablePagination } from "@/components/data-table/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuantumEntryForm } from "./quantum-entry-form";
import { BasecampImportForm } from "./import-form";
import { deleteQuantumEntry, importQuantumEntries } from "./actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { QUANTUM_IMPORT_COLUMNS } from "@/lib/import-columns";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Quantum Sheet" };

export default async function QuantumPage({
  searchParams,
}: PageProps<"/quantum">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const employeeFilter = typeof raw.employee === "string" ? raw.employee : "";

  const where: Prisma.QuantumEntryWhereInput = {
    ...(employeeFilter ? { employeeId: employeeFilter } : {}),
    ...(params.q
      ? {
          OR: [
            { brand: { contains: params.q, mode: "insensitive" } },
            { workName: { contains: params.q, mode: "insensitive" } },
            { employee: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [entries, total, employees] = await Promise.all([
    db.quantumEntry.findMany({
      where,
      orderBy: [{ employee: { name: "asc" } }, { date: "desc" }],
      skip: params.skip,
      take: params.take,
      include: {
        employee: { select: { id: true, empId: true, name: true } },
      },
    }),
    db.quantumEntry.count({ where }),
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
  ]);

  // Basecamp connection state (HR only).
  let basecampProjects: { id: string; name: string }[] | null = null;
  const configured = basecampConfigured();
  if (configured && user.role === "HR_ADMIN") {
    const auth = await getAccessToken(user.id);
    if (auth) {
      try {
        const projects = await listProjects(auth.accessToken, auth.accountId);
        basecampProjects = projects.map((p) => ({
          id: String(p.id),
          name: p.name,
        }));
      } catch {
        basecampProjects = null;
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Quantum Sheet</h1>
        <BulkImportForm
          action={importQuantumEntries}
          columns={QUANTUM_IMPORT_COLUMNS}
          title="Import quantum entries"
        />
      </div>

      <div className="mt-6">
        <QuantumEntryForm showEmployeePicker employees={employees} />
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
        {!configured ? (
          <p className="text-zinc-500">
            Basecamp import: set BASECAMP_CLIENT_ID / BASECAMP_CLIENT_SECRET to
            enable.
          </p>
        ) : basecampProjects ? (
          <BasecampImportForm
            employees={employees}
            projects={basecampProjects}
          />
        ) : (
          <p>
            <a
              href="/api/basecamp/connect"
              className="font-medium underline underline-offset-4"
            >
              Connect Basecamp
            </a>{" "}
            <span className="text-zinc-500">
              to import project todos into the sheet.
            </span>
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Name of the Work</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  No entries yet.
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link
                    href={`/employees/${e.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {e.employee.name}
                  </Link>
                </TableCell>
                <TableCell>{e.date.toISOString().slice(0, 10)}</TableCell>
                <TableCell>{e.brand}</TableCell>
                <TableCell>
                  {e.workName}
                  {e.source === "BASECAMP" && (
                    <span className="ml-1.5 text-xs text-zinc-400">
                      (imported)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {e.link ? (
                    <a
                      href={e.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      open
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {e.durationMins > 0
                    ? `${Math.floor(e.durationMins / 60)}h ${e.durationMins % 60}m`
                    : "—"}
                </TableCell>
                <TableCell>
                  <form action={deleteQuantumEntry}>
                    <input type="hidden" name="id" value={e.id} />
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
          pathname="/quantum"
        />
      </div>
    </main>
  );
}
