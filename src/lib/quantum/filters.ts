// Quantum Sheet: the URL's filters (search, project, type, status, person,
// dates) as Prisma conditions, shared by the page and the timesheet CSV so
// both always show the same rows.

import type { Prisma } from "@/generated/prisma/client";
import { dayRange } from "@/lib/date-filter";
import { listParam, stringParam } from "@/lib/table-params";
import { QUANTUM_KINDS, QUANTUM_STATUSES, statusWhere } from "./todos";

type RawSearchParams = Record<string, string | string[] | undefined>;

export function quantumFilters(
  raw: RawSearchParams,
  { today, isTeamView, myPersonId }: { today: string; isTeamView: boolean; myPersonId: string | null },
) {
  const q = stringParam(raw.q);
  const projects = listParam(raw.project);
  const people = listParam(raw.person);
  const kindParam = listParam(raw.type);
  const kinds = QUANTUM_KINDS.map((kind) => kind.value).filter((value) => kindParam.includes(value));
  const statusParam = listParam(raw.status);
  const statuses = QUANTUM_STATUSES.map((status) => status.value).filter((value) => statusParam.includes(value));
  const days = dayRange({ preset: stringParam(raw.day), from: stringParam(raw.from), to: stringParam(raw.to) });

  // Trashed to-dos stay in the table (so the sync can tell) but never show;
  // people outside HR and managers see their own to-dos only.
  const visible: Prisma.QuantumTodoWhereInput = {
    status: { not: "trashed" },
    ...(isTeamView ? {} : { assigneeIds: { has: myPersonId ?? "-" } }),
  };
  const and: Prisma.QuantumTodoWhereInput[] = [visible];
  if (q)
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { projectName: { contains: q, mode: "insensitive" } },
        { listName: { contains: q, mode: "insensitive" } },
      ],
    });
  if (projects.length) and.push({ projectId: { in: projects } });
  if (kinds.length) and.push({ kind: { in: kinds } });
  const byStatus = statusWhere(statuses, today);
  if (byStatus) and.push(byStatus);
  // Everything except "who" and "when", which the timesheet reads from the
  // hour entries instead of the to-do.
  const withoutPeopleOrDates = [...and];
  if (isTeamView && people.length) and.push({ assigneeIds: { hasSome: people } });
  if (days) and.push({ sheetDay: days });

  return { q, projects, people, kinds, statuses, days, visible, and, withoutPeopleOrDates };
}
