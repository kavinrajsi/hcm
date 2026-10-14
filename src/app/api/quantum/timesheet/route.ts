import { db } from "@/lib/db";
import { currentUser } from "@/lib/rbac";
import { myEmployeeId } from "@/lib/my-employee";
import { istDay } from "@/lib/date-filter";
import { formatDay } from "@/lib/format-date";
import { quantumFilters } from "@/lib/quantum/filters";
import { timesheet, timesheetCsv } from "@/lib/quantum/timesheet";

// Quantum Sheet "Download CSV": the Timesheet view with the same filters,
// one row per hour entry. HR and managers get everyone's entries; others
// only their own (as on the page).

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const isTeamView = user.role === "HR_ADMIN" || user.role === "MANAGER";
  const employeeId = await myEmployeeId(user);
  const me = employeeId
    ? await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, basecampPersonId: true } })
    : null;
  const myPersonId = me?.basecampPersonId ?? null;
  if (!isTeamView && !myPersonId) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  const today = istDay();
  const filters = quantumFilters(raw, { today, isTeamView, myPersonId });
  const { projects } = await timesheet({
    todoWhere: { AND: filters.withoutPeopleOrDates },
    dateRange: filters.days,
    people: isTeamView ? filters.people : [],
    ...(isTeamView ? {} : { onlyPersonId: myPersonId, onlyEmployeeId: me?.id ?? null }),
  });
  // The BOM makes Excel read the file as UTF-8 (names, ®, ₹).
  const csv = `﻿${timesheetCsv(projects, (date) => formatDay(date))}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quantum-timesheet-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
