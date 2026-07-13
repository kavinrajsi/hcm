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
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Letters Management
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Offer, intern, and revised compensation letters. Generate from a
        template, edit, then send — sent copies are archived below.
      </p>

      <div className="mt-6">
        <LetterComposer employees={employees} />
      </div>

      <h2 className="mt-10 text-lg font-medium">History</h2>
      <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                <TableCell className="max-w-72 truncate">{l.subject}</TableCell>
                <TableCell>
                  {l.sentAt ? l.sentAt.toISOString().slice(0, 10) : "draft"}
                </TableCell>
                <TableCell>{l.sentTo ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
