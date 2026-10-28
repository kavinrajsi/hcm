import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { formatDay, formatInstantDay } from "@/lib/format-date";
import { EMP_TYPE_LABELS } from "@/lib/emp-type";
import {
  EXIT_LETTER_TEMPLATES,
  exitLetterTypesFor,
  type ExitLetterType,
} from "@/lib/exit-letters";
import { getExitLetterSignatory } from "@/lib/exit-letter-signatory";
import { PageHeader, PageShell } from "@/components/page";
import { SignatoryForm, GenerateLetterButton } from "./exit-letter-forms";

export const metadata = { title: "Exit letters" };

// The three documents a leaver receives on exit. Each is made as a PDF from
// the template, with the signatory below, and kept on the employee's record.
export default async function ExitLettersPage({
  params,
}: PageProps<"/exit/[employeeId]/letters">) {
  await requirePageRole("HR_ADMIN");
  const { employeeId } = await params;

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      empId: true,
      name: true,
      empType: true,
      dateOfExit: true,
    },
  });
  if (!employee?.dateOfExit) notFound();

  const [signatory, letters] = await Promise.all([
    getExitLetterSignatory(),
    db.letter.findMany({
      where: {
        employeeId: employee.id,
        pdfBlobKey: { not: null },
        type: { in: ["RELIEVING", "EXPERIENCE", "INTERNSHIP_CERTIFICATE"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, pdfBlobKey: true, createdAt: true },
    }),
  ]);

  const types = exitLetterTypesFor(employee.empType);

  return (
    <PageShell>
      <PageHeader
        title={`Exit letters — ${employee.name}`}
        description={`${employee.empId} · ${EMP_TYPE_LABELS[employee.empType] ?? employee.empType} · exited ${formatDay(employee.dateOfExit)}`}
      />

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Who signs the letters</h2>
        <SignatoryForm initial={signatory} />
        {!signatory && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Save the signatory before making letters.
          </p>
        )}
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Make a letter</h2>
        {types.map((type: ExitLetterType) => (
          <div key={type} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {EXIT_LETTER_TEMPLATES[type].title} for {employee.name}
            </p>
            <GenerateLetterButton employeeId={employee.id} type={type} disabled={!signatory} />
          </div>
        ))}
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Letters made</h2>
        {letters.length === 0 && (
          <p className="text-sm text-zinc-500">No exit letters yet.</p>
        )}
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {letters.map((letter) => (
            <li key={letter.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span>
                {EXIT_LETTER_TEMPLATES[letter.type as ExitLetterType]?.title ?? letter.type}
                <span className="ml-2 text-zinc-500">{formatInstantDay(letter.createdAt)}</span>
              </span>
              <a
                href={`/api/files/${letter.pdfBlobKey}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                Download PDF
              </a>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
