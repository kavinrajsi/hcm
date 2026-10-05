import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { teamEmployeeWhere } from "@/lib/team-scope";
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
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { CollapsibleForm } from "@/components/collapsible-form";
import { Button } from "@/components/ui/button";
import { ArrowOutwardIcon, DeleteIcon } from "@/components/icons";
import { QuantumEntryForm } from "./quantum-entry-form";
import { BasecampImportForm } from "./import-form";
import { deleteQuantumEntry, importQuantumEntries } from "./actions";
import { BulkImportForm } from "@/components/bulk-import-form";
import { QUANTUM_IMPORT_COLUMNS } from "@/lib/import-columns";
import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format-date";

export const metadata = { title: "Quantum Sheet" };

function formatDuration(mins: number) {
  return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : "—";
}

export default async function QuantumPage({
  searchParams,
}: PageProps<"/quantum">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const employeeFilter = typeof raw.employee === "string" ? raw.employee : "";

  // Managers see only their direct reports' entries.
  const team = teamEmployeeWhere(user);
  const where: Prisma.QuantumEntryWhereInput = {
    AND: [{ employee: team }],
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
      where: { dateOfExit: null, ...team },
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
        basecampProjects = projects.map((project) => ({
          id: String(project.id),
          name: project.name,
        }));
      } catch {
        basecampProjects = null;
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Quantum Sheet"
        actions={
          <BulkImportForm
            action={importQuantumEntries}
            columns={QUANTUM_IMPORT_COLUMNS}
            title="Import quantum entries"
          />
        }
      />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="Add entry">
          <QuantumEntryForm showEmployeePicker employees={employees} />
        </CollapsibleForm>
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

      <div className="mt-6">
        <MobileList isEmpty={entries.length === 0} empty="No entries yet.">
          {entries.map((entry) => (
            <ListCard
              key={entry.id}
              title={
                <>
                  {entry.workName}
                  {entry.source === "BASECAMP" && (
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">
                      (imported)
                    </span>
                  )}
                </>
              }
              href={`/employees/${entry.employee.id}`}
              subtitle={[entry.employee.name, entry.brand]
                .filter(Boolean)
                .join(" · ")}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                  {formatDuration(entry.durationMins)}
                </span>
              }
              meta={<span>{formatDay(entry.date)}</span>}
              actions={
                <>
                  {entry.link && (
                    <Button
                      variant="outline"
                      className="h-10"
                      nativeButton={false}
                      render={
                        <a
                          href={entry.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <ArrowOutwardIcon className="size-4" />
                      Open link
                    </Button>
                  )}
                  <form action={deleteQuantumEntry} className="ml-auto">
                    <input type="hidden" name="id" value={entry.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      className="h-10 text-zinc-500 active:text-red-600"
                    >
                      <DeleteIcon className="size-4" />
                      Delete
                    </Button>
                  </form>
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
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Link
                    href={`/employees/${entry.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {entry.employee.name}
                  </Link>
                </TableCell>
                <TableCell>{formatDay(entry.date)}</TableCell>
                <TableCell>{entry.brand}</TableCell>
                <TableCell>
                  {entry.workName}
                  {entry.source === "BASECAMP" && (
                    <span className="ml-1.5 text-xs text-zinc-400">
                      (imported)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {entry.link ? (
                    <a
                      href={entry.link}
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
                <TableCell>{formatDuration(entry.durationMins)}</TableCell>
                <TableCell>
                  <form action={deleteQuantumEntry}>
                    <input type="hidden" name="id" value={entry.id} />
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
          pathname="/quantum"
        />
      </div>
    </PageShell>
  );
}
