import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { ListCard } from "@/components/list-card";
import { CollapsibleForm } from "@/components/collapsible-form";
import { LetterComposer } from "./letter-composer";

export const metadata = { title: "Letters" };

export default async function LettersPage() {
  await requireRole("HR_ADMIN");

  const [employees, letters] = await Promise.all([
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
    db.letter.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { employee: { select: { id: true, empId: true, name: true } } },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Letters Management"
        description="Offer, intern, and revised compensation letters. Generate from a template, edit, then send — sent copies are archived below."
      />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="New letter">
          <LetterComposer employees={employees} />
        </CollapsibleForm>
      </div>

      <h2 className="mt-8 text-lg font-medium md:mt-10">History</h2>
      <div className="mt-3">
        <MobileList isEmpty={letters.length === 0} empty="No letters yet.">
          {letters.map((l) => (
            <ListCard
              key={l.id}
              href={`/employees/${l.employee.id}`}
              title={l.employee.name}
              subtitle={<span className="line-clamp-2">{l.subject}</span>}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {l.type}
                </span>
              }
              meta={
                <>
                  <span className="tabular-nums">
                    {l.sentAt ? l.sentAt.toISOString().slice(0, 10) : "draft"}
                  </span>
                  <span className="break-all">{l.sentTo ?? "—"}</span>
                </>
              }
            />
          ))}
        </MobileList>
        <DesktopTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {letters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500">
                    No letters yet.
                  </TableCell>
                </TableRow>
              )}
              {letters.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/employees/${l.employee.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {l.employee.name}
                    </Link>
                  </TableCell>
                  <TableCell>{l.type}</TableCell>
                  <TableCell className="max-w-72 truncate">
                    {l.subject}
                  </TableCell>
                  <TableCell>
                    {l.sentAt ? l.sentAt.toISOString().slice(0, 10) : "draft"}
                  </TableCell>
                  <TableCell>{l.sentTo ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
      </div>
    </PageShell>
  );
}
