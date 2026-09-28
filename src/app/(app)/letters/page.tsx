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
import { TemplateEditor } from "./template-editor";
import { getLetterTemplate } from "@/lib/letter-templates";
import { formatDateTime, formatInstantDay } from "@/lib/format-date";

const TEMPLATE_TYPES = [
  ["OFFER", "Offer letter"],
  ["INTERN", "Intern letter"],
  ["COMPENSATION", "Revised compensation"],
] as const;

export const metadata = { title: "Letters" };

export default async function LettersPage() {
  await requireRole("HR_ADMIN");

  const [employees, letters, templates] = await Promise.all([
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
    Promise.all(TEMPLATE_TYPES.map(([type]) => getLetterTemplate(type))),
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

      <div className="mt-4">
        <CollapsibleForm label="Templates">
          <p className="mb-3 text-sm text-zinc-500">
            Starting text for each letter type. Placeholders like {"{{name}}"}{" "}
            are filled with the employee&apos;s details when a draft is
            generated.
          </p>
          <div className="flex flex-col gap-4">
            {TEMPLATE_TYPES.map(([type, label], index) => {
              const template = templates[index];
              return (
                <TemplateEditor
                  key={`${type}-${template.updatedAt?.getTime() ?? "default"}`}
                  type={type}
                  label={label}
                  subject={template.subject}
                  body={template.body}
                  custom={template.custom}
                  editedNote={
                    template.updatedAt
                      ? `Edited by ${template.updatedBy ?? "HR"} on ${formatDateTime(template.updatedAt)}`
                      : null
                  }
                />
              );
            })}
          </div>
        </CollapsibleForm>
      </div>

      <h2 className="mt-8 text-lg font-medium md:mt-10">History</h2>
      <div className="mt-3">
        <MobileList isEmpty={letters.length === 0} empty="No letters yet.">
          {letters.map((letter) => (
            <ListCard
              key={letter.id}
              href={`/employees/${letter.employee.id}`}
              title={letter.employee.name}
              subtitle={<span className="line-clamp-2">{letter.subject}</span>}
              badge={
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {letter.type}
                </span>
              }
              meta={
                <>
                  <span className="tabular-nums">
                    {letter.sentAt ? formatInstantDay(letter.sentAt) : "draft"}
                  </span>
                  <span className="break-all">{letter.sentTo ?? "—"}</span>
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
              {letters.map((letter) => (
                <TableRow key={letter.id}>
                  <TableCell>
                    <Link
                      href={`/employees/${letter.employee.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {letter.employee.name}
                    </Link>
                  </TableCell>
                  <TableCell>{letter.type}</TableCell>
                  <TableCell className="max-w-72 truncate">
                    {letter.subject}
                  </TableCell>
                  <TableCell>
                    {letter.sentAt ? formatInstantDay(letter.sentAt) : "draft"}
                  </TableCell>
                  <TableCell>{letter.sentTo ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
      </div>
    </PageShell>
  );
}
