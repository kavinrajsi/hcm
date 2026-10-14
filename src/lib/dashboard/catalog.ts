// Dashboard widgets: the ready-made catalogue. Most are saved widget specs
// (the same engine the builder uses); a few "built-in" ones have their own
// layout (recruitment charts, celebrations). HR can add more to the
// catalogue from any custom widget (DashboardCatalogWidget rows).

import type { Role } from "@/generated/prisma/enums";
import { SOURCES } from "./sources";
import type { WidgetSize, WidgetSpec } from "./spec";

export const BUILTIN_KEYS = ["recruitment-trend", "recruitment-pipeline", "recruitment-table", "celebrations"] as const;
export type BuiltinKey = (typeof BUILTIN_KEYS)[number];

export const BUILTIN_ROLES: Record<BuiltinKey, Role[]> = {
  "recruitment-trend": ["HR_ADMIN"],
  "recruitment-pipeline": ["HR_ADMIN"],
  "recruitment-table": ["HR_ADMIN"],
  celebrations: ["HR_ADMIN", "MANAGER"],
};

export type CatalogEntry = {
  id: string;
  title: string;
  description: string;
  size: WidgetSize;
  group: string;
} & ({ builtinKey: BuiltinKey; spec?: undefined } | { spec: Partial<WidgetSpec> & Pick<WidgetSpec, "source">; builtinKey?: undefined });

const spec = (value: Partial<WidgetSpec> & Pick<WidgetSpec, "source">) => value;

export const CATALOG: CatalogEntry[] = [
  // Today's dashboard tiles.
  {
    id: "active-employees",
    group: "People",
    title: "Active employees",
    description: "Everyone who hasn't left",
    size: "small",
    spec: spec({ source: "employees", filters: { status: ["active"] }, chart: "number" }),
  },
  {
    id: "joiners-this-month",
    group: "People",
    title: "Joiners this month",
    description: "People who joined this month",
    size: "small",
    spec: spec({ source: "employees", dateField: "joined", range: { preset: "this-month" }, chart: "number", compare: true }),
  },
  {
    id: "exits-this-month",
    group: "People",
    title: "Exits this month",
    description: "People who left this month",
    size: "small",
    spec: spec({ source: "employees", dateField: "exited", range: { preset: "this-month" }, chart: "number", compare: true }),
  },
  {
    id: "probation-due",
    group: "People",
    title: "Probation due",
    description: "Confirmations due by the end of this month",
    size: "small",
    spec: spec({
      source: "probation",
      filters: { status: ["PENDING", "EXTENDED"] },
      range: { preset: "to-month-end" },
      chart: "number",
    }),
  },
  {
    id: "id-cards-pending",
    group: "People",
    title: "ID cards pending",
    description: "Cards not yet issued or returned",
    size: "small",
    spec: spec({
      source: "idCards",
      filters: { status: ["PHOTO_TAKEN", "ASSIGNED_TO_DESIGNER", "PENDING", "RE_ISSUE", "RETURN_PENDING"] },
      chart: "number",
    }),
  },
  {
    id: "upcoming-sessions",
    group: "Learning",
    title: "Upcoming sessions",
    description: "Sessions still to come",
    size: "small",
    spec: spec({ source: "sessions", range: { preset: "upcoming" }, chart: "number" }),
  },
  {
    id: "freelancers",
    group: "People",
    title: "Freelancers",
    description: "Freelancers in the directory",
    size: "small",
    spec: spec({ source: "freelancers", chart: "number" }),
  },
  // Recruitment (HR).
  {
    id: "recruitment-trend",
    group: "Recruitment",
    title: "Job postings by role",
    description: "Applications per month for the top roles",
    size: "medium",
    builtinKey: "recruitment-trend",
  },
  {
    id: "recruitment-pipeline",
    group: "Recruitment",
    title: "Recruitment pipeline",
    description: "Candidates at each stage right now",
    size: "medium",
    builtinKey: "recruitment-pipeline",
  },
  {
    id: "recruitment-table",
    group: "Recruitment",
    title: "Applications by role and month",
    description: "Every role, month by month, with the full time / intern split",
    size: "huge",
    builtinKey: "recruitment-table",
  },
  {
    id: "applications-by-stage",
    group: "Recruitment",
    title: "Applications by stage",
    description: "Last 3 months' applications, by where they are now",
    size: "medium",
    spec: spec({ source: "candidates", range: { preset: "last-3-months" }, groupBy: "stage", chart: "bar" }),
  },
  // More people widgets.
  {
    id: "headcount-by-department",
    group: "People",
    title: "Headcount by department",
    description: "Active employees in each department",
    size: "medium",
    spec: spec({ source: "employees", filters: { status: ["active"] }, groupBy: "department", chart: "pie" }),
  },
  {
    id: "headcount-by-type",
    group: "People",
    title: "Headcount by type",
    description: "Permanent, probation, contract and interns",
    size: "medium",
    spec: spec({ source: "employees", filters: { status: ["active"] }, groupBy: "empType", chart: "pie" }),
  },
  {
    id: "joiners-by-month",
    group: "People",
    title: "Joiners by month",
    description: "People who joined, last 12 months",
    size: "large",
    spec: spec({ source: "employees", dateField: "joined", range: { preset: "last-12-months" }, groupBy: "time:month", chart: "bar" }),
  },
  {
    id: "celebrations",
    group: "People",
    title: "Birthdays & anniversaries",
    description: "The next 30 days",
    size: "tall",
    builtinKey: "celebrations",
  },
  // Leave.
  {
    id: "on-leave-today",
    group: "Leave",
    title: "On leave today",
    description: "Who's away today",
    size: "tall",
    spec: spec({
      source: "leave",
      range: { preset: "today" },
      filters: { checkin: ["leave"], status: ["PENDING", "APPROVED"] },
      groupBy: "person",
      chart: "table",
      limit: 30,
    }),
  },
  {
    id: "wfh-today",
    group: "Leave",
    title: "Working from home today",
    description: "Who's working from home today",
    size: "tall",
    spec: spec({
      source: "leave",
      range: { preset: "today" },
      filters: { checkin: ["wfh"], status: ["PENDING", "APPROVED"] },
      groupBy: "person",
      chart: "table",
      limit: 30,
    }),
  },
  {
    id: "leave-pending",
    group: "Leave",
    title: "Leave waiting for review",
    description: "Requests still pending",
    size: "small",
    spec: spec({ source: "leave", filters: { status: ["PENDING"] }, chart: "number" }),
  },
  {
    id: "leave-days-by-month",
    group: "Leave",
    title: "Leave days by month",
    description: "Approved leave days, last 6 months",
    size: "large",
    spec: spec({
      source: "leave",
      measure: "days",
      range: { preset: "last-6-months" },
      filters: { status: ["APPROVED"], checkin: ["leave"] },
      groupBy: "time:month",
      chart: "bar",
    }),
  },
  {
    id: "leave-by-type",
    group: "Leave",
    title: "Leave by type",
    description: "This month's requests by type",
    size: "medium",
    spec: spec({ source: "leave", range: { preset: "this-month" }, groupBy: "type", chart: "pie" }),
  },
  // Quantum Sheet.
  {
    id: "quantum-hours-month",
    group: "Work",
    title: "Hours logged this month",
    description: "Quantum Sheet hours, against last month",
    size: "small",
    spec: spec({ source: "quantumHours", range: { preset: "this-month" }, chart: "number", compare: true }),
  },
  {
    id: "quantum-hours-by-project",
    group: "Work",
    title: "Hours by project",
    description: "Quantum Sheet hours this month, busiest projects first",
    size: "medium",
    spec: spec({ source: "quantumHours", range: { preset: "this-month" }, groupBy: "project", chart: "bar" }),
  },
  {
    id: "quantum-hours-by-person",
    group: "Work",
    title: "Hours by person",
    description: "Who logged Quantum Sheet hours this month",
    size: "medium",
    spec: spec({ source: "quantumHours", range: { preset: "this-month" }, groupBy: "person", chart: "table", limit: 30 }),
  },
  {
    id: "quantum-overdue",
    group: "Work",
    title: "Overdue to-dos",
    description: "Open Basecamp to-dos past their due date",
    size: "small",
    spec: spec({ source: "quantumTodos", filters: { status: ["overdue"] }, chart: "number" }),
  },
  {
    id: "quantum-completed-by-month",
    group: "Work",
    title: "To-dos completed by month",
    description: "Last 6 months",
    size: "large",
    spec: spec({
      source: "quantumTodos",
      dateField: "completed",
      range: { preset: "last-6-months" },
      filters: { status: ["completed"] },
      groupBy: "time:month",
      chart: "line",
    }),
  },
  // Devices.
  {
    id: "devices-by-status",
    group: "Devices",
    title: "Devices by status",
    description: "In stock, assigned, in service…",
    size: "medium",
    spec: spec({ source: "devices", groupBy: "status", chart: "pie" }),
  },
];

/** Who can use a catalogue entry: a built-in's own roles, else its source's. */
export function catalogRoles(entry: Pick<CatalogEntry, "builtinKey" | "spec">): Role[] {
  if (entry.builtinKey) return BUILTIN_ROLES[entry.builtinKey];
  return entry.spec ? SOURCES[entry.spec.source].roles : [];
}

/** Today's dashboard, used until HR saves a default for a role. */
export const DEFAULT_LAYOUT = [
  "active-employees",
  "joiners-this-month",
  "exits-this-month",
  "probation-due",
  "id-cards-pending",
  "upcoming-sessions",
  "freelancers",
  "recruitment-trend",
  "recruitment-pipeline",
  "recruitment-table",
] as const;
