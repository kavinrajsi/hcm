// Dashboard widgets: the data a widget can use. Each source says who may use
// it, what it can count or total, its dates and fields, and how to load rows
// for one viewer. Scope always comes from the person *viewing* (shared
// dashboards and catalogue widgets included), using the same rules as the
// matching page: HR everyone, managers their direct reports, employees their
// own records. No raw SQL; values from a widget spec only ever reach Prisma
// as typed `in` / `equals` conditions on known columns. Personal data
// (contact details, IDs, birthdays) is never a field.

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { EMP_TYPE_LABELS } from "@/lib/emp-type";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/leave";
import { ID_CARD_STATUSES } from "@/lib/id-card-status";
import { DEVICE_OWNERSHIP_LABELS, DEVICE_STATUS_LABELS, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import { DEVICE_OS_LABELS } from "@/lib/devices/os";
import { QUANTUM_KINDS, QUANTUM_STATUSES, statusWhere as quantumStatusWhere, type QuantumStatus } from "@/lib/quantum/todos";
import { NOT_SPAM, POSITIONS, statusOf, statusWhere as candidateStatusWhere } from "@/app/(app)/candidates/query";
import { CANDIDATE_STATUSES, type CandidateStatus } from "@/app/(app)/candidates/statuses";
import type { SourceKey } from "./spec";
import { dateBounds, dayOf, instantBounds, type DayRange } from "./time";

/** The person a widget is computed for. */
export type Viewer = {
  id: string;
  role: Role;
  employeeId: string | null;
  basecampPersonId: string | null;
};

export type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  /** Can split a chart by it (default true). */
  group?: boolean;
  /** Can narrow by it (default true). */
  filter?: boolean;
  /** Fixed values and their labels. */
  labels?: Record<string, string>;
  /** Values from the data, already scoped to the viewer. */
  options?: (viewer: Viewer) => Promise<Option[]>;
  /** The source page's query parameter for this field, for click-through. */
  param?: string;
};

export type LoadContext = {
  viewer: Viewer;
  range: DayRange;
  dateField: string;
  filters: Record<string, string[]>;
  measure: string;
  /** IST "YYYY-MM-DD", for "overdue". */
  today: string;
};

/** One record: the day it counts on, how much it adds, and its field values. */
export type Row = {
  day: string | null;
  value: number;
  keys: Record<string, string | string[]>;
};

export type Source = {
  key: SourceKey;
  label: string;
  description: string;
  roles: Role[];
  measures: { key: string; label: string; unit?: string }[];
  /** First is the default; empty = the source has no date to filter on. */
  dateFields: { key: string; label: string }[];
  fields: FieldDef[];
  /** The page a click opens, before field parameters. */
  page: (viewer: Viewer, spec: { dateField: string; filters: Record<string, string[]>; rangePreset: string }) => string;
  load: (context: LoadContext) => Promise<Row[]>;
  /** Fast total without loading rows (no grouping, plain count). */
  count?: (context: LoadContext) => Promise<number>;
};

const HR: Role[] = ["HR_ADMIN"];
const HR_OR_MANAGER: Role[] = ["HR_ADMIN", "MANAGER"];
const EVERYONE: Role[] = ["HR_ADMIN", "MANAGER", "EMPLOYEE"];
const NONE = "__none";

const pick = (values: string[] | undefined, allowed: Record<string, string>) =>
  (values ?? []).filter((value) => value in allowed);
const list = (values: string[] | undefined) => (values ?? []).filter(Boolean);
const sorted = (options: Option[]) => options.sort((left, right) => left.label.localeCompare(right.label));
const distinct = (values: (string | null)[]): Option[] =>
  sorted([...new Set(values.filter((value): value is string => Boolean(value)))].map((value) => ({ value, label: value })));

/** Employees a viewer may see on HR/manager pages (as teamEmployeeWhere). */
function teamWhere(viewer: Viewer): Prisma.EmployeeWhereInput {
  return viewer.role === "MANAGER" ? { manager: { userId: viewer.id } } : {};
}

// ---------------------------------------------------------------- employees

const employees: Source = {
  key: "employees",
  label: "Employees",
  description: "Headcount, joiners and leavers",
  roles: HR_OR_MANAGER,
  measures: [{ key: "count", label: "People" }],
  dateFields: [
    { key: "joined", label: "Joined on" },
    { key: "exited", label: "Left on" },
  ],
  fields: [
    { key: "status", label: "Active or left", labels: { active: "Active", left: "Left" } },
    { key: "empType", label: "Employment type", labels: EMP_TYPE_LABELS, param: "type" },
    {
      key: "department",
      label: "Department",
      param: "department",
      options: async (viewer) =>
        distinct((await db.employee.findMany({ where: teamWhere(viewer), select: { department: true }, distinct: ["department"] })).map((row) => row.department)),
    },
    {
      key: "designation",
      label: "Designation",
      param: "designation",
      options: async (viewer) =>
        distinct((await db.employee.findMany({ where: teamWhere(viewer), select: { designation: true }, distinct: ["designation"] })).map((row) => row.designation)),
    },
    {
      key: "manager",
      label: "Manager",
      options: async (viewer) => {
        const managers = await db.employee.findMany({
          where: { reports: { some: teamWhere(viewer) } },
          select: { id: true, name: true },
        });
        return sorted([...managers.map((manager) => ({ value: manager.id, label: manager.name })), { value: NONE, label: "No manager" }]);
      },
    },
  ],
  page: (viewer, spec) =>
    spec.dateField === "exited" || spec.filters.status?.includes("left")
      ? "/exit"
      : spec.dateField === "joined" && spec.rangePreset === "this-month"
        ? "/employees?joined=month"
        : "/employees",
  async load(context) {
    const rows = await db.employee.findMany({
      where: employeeWhere(context),
      select: { dateOfJoining: true, dateOfExit: true, empType: true, department: true, designation: true, managerId: true },
    });
    return rows.map((row) => {
      const date = context.dateField === "exited" ? row.dateOfExit : row.dateOfJoining;
      return {
        day: date ? dayOf(date, "date") : null,
        value: 1,
        keys: {
          status: row.dateOfExit ? "left" : "active",
          empType: row.empType,
          department: row.department,
          designation: row.designation,
          manager: row.managerId ?? NONE,
        },
      };
    });
  },
  count: (context) => db.employee.count({ where: employeeWhere(context) }),
};

function employeeWhere({ viewer, range, dateField, filters }: LoadContext): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [teamWhere(viewer)];
  const bounds = dateBounds(range);
  if (dateField === "exited") and.push({ dateOfExit: bounds ?? { not: null } });
  else if (bounds) and.push({ dateOfJoining: bounds });
  const status = pick(filters.status, { active: "", left: "" });
  if (status.length === 1) and.push({ dateOfExit: status[0] === "active" ? null : { not: null } });
  const types = pick(filters.empType, EMP_TYPE_LABELS);
  if (types.length) and.push({ empType: { in: types as never } });
  if (list(filters.department).length) and.push({ department: { in: list(filters.department) } });
  if (list(filters.designation).length) and.push({ designation: { in: list(filters.designation) } });
  const managers = list(filters.manager);
  if (managers.length)
    and.push({
      OR: [
        { managerId: { in: managers.filter((id) => id !== NONE) } },
        ...(managers.includes(NONE) ? [{ managerId: null }] : []),
      ],
    });
  return { AND: and };
}

// -------------------------------------------------------------------- leave

const LEAVE_TYPES_WITH_NONE: Record<string, string> = { ...LEAVE_TYPE_LABELS, [NONE]: "Not sorted yet" };

function leaveScope(viewer: Viewer): Prisma.LeaveEntryWhereInput {
  if (viewer.role === "HR_ADMIN") return {};
  if (viewer.role === "MANAGER") return { employee: { manager: { userId: viewer.id } } };
  return { employeeId: viewer.employeeId ?? "-" };
}

const leave: Source = {
  key: "leave",
  label: "Leave & WFH",
  description: "Leave and work-from-home posts from Basecamp",
  roles: EVERYONE,
  measures: [
    { key: "count", label: "Requests" },
    { key: "days", label: "Days", unit: "days" },
  ],
  dateFields: [
    { key: "on", label: "Leave dates" },
    { key: "posted", label: "Posted on" },
  ],
  fields: [
    { key: "type", label: "Type", labels: LEAVE_TYPES_WITH_NONE, param: "type" },
    { key: "status", label: "Status", labels: LEAVE_STATUS_LABELS, param: "status" },
    { key: "checkin", label: "Leave or WFH", labels: { leave: "Leave", wfh: "Work from home" } },
    {
      key: "person",
      label: "Person",
      options: async (viewer) => {
        const people = await db.employee.findMany({
          where: { leaveEntries: { some: leaveScope(viewer) } },
          select: { id: true, name: true },
        });
        return [...sorted(people.map((person) => ({ value: person.id, label: person.name }))), { value: NONE, label: "Not matched to an employee" }];
      },
    },
    {
      key: "department",
      label: "Department",
      options: async (viewer) =>
        distinct(
          (
            await db.employee.findMany({
              where: { leaveEntries: { some: leaveScope(viewer) } },
              select: { department: true },
              distinct: ["department"],
            })
          ).map((row) => row.department),
        ),
    },
  ],
  page: (viewer) => (viewer.role === "EMPLOYEE" ? "/profile/leave" : "/leave"),
  async load(context) {
    const rows = await db.leaveEntry.findMany({
      where: leaveWhere(context),
      select: {
        startDate: true,
        postedOn: true,
        days: true,
        type: true,
        status: true,
        checkin: true,
        employeeId: true,
        employee: { select: { department: true } },
      },
    });
    return rows.map((row) => ({
      day: dayOf(context.dateField === "posted" ? row.postedOn : (row.startDate ?? row.postedOn), "date"),
      value: context.measure === "days" ? Number(row.days ?? 0) : 1,
      keys: {
        type: row.type ?? NONE,
        status: row.status,
        checkin: row.checkin,
        person: row.employeeId ?? NONE,
        department: row.employee?.department ?? NONE,
      },
    }));
  },
  count: (context) => db.leaveEntry.count({ where: leaveWhere(context) }),
};

function leaveWhere({ viewer, range, dateField, filters }: LoadContext): Prisma.LeaveEntryWhereInput {
  const and: Prisma.LeaveEntryWhereInput[] = [leaveScope(viewer)];
  const bounds = dateBounds(range);
  if (bounds && dateField === "posted") and.push({ postedOn: bounds });
  else if (bounds) {
    // Leave dates: entries touching the range; unsorted posts count on the day posted.
    and.push({
      OR: [
        {
          startDate: { not: null, ...(bounds.lt ? { lt: bounds.lt } : {}) },
          ...(bounds.gte ? { OR: [{ endDate: { gte: bounds.gte } }, { endDate: null, startDate: { gte: bounds.gte } }] } : {}),
        },
        { startDate: null, postedOn: bounds },
      ],
    });
  }
  const types = pick(filters.type, LEAVE_TYPES_WITH_NONE);
  if (types.length)
    and.push({
      OR: [
        { type: { in: types.filter((type) => type !== NONE) as never } },
        ...(types.includes(NONE) ? [{ type: null }] : []),
      ],
    });
  const statuses = pick(filters.status, LEAVE_STATUS_LABELS);
  if (statuses.length) and.push({ status: { in: statuses as never } });
  const checkins = pick(filters.checkin, { leave: "", wfh: "" });
  if (checkins.length) and.push({ checkin: { in: checkins } });
  const people = list(filters.person);
  if (people.length)
    and.push({
      OR: [
        { employeeId: { in: people.filter((id) => id !== NONE) } },
        ...(people.includes(NONE) ? [{ employeeId: null }] : []),
      ],
    });
  if (list(filters.department).length) and.push({ employee: { department: { in: list(filters.department) } } });
  return { AND: and };
}

// --------------------------------------------------------------- candidates

const STAGE_LABELS = Object.fromEntries(CANDIDATE_STATUSES.map((status) => [status, status]));
const POSITION_LABELS = Object.fromEntries(POSITIONS.map((position) => [position, position]));
// Test applications from a local copy of the career form (as Recruitment stats).
const NOT_LOCAL: Prisma.CandidateWhereInput = {
  OR: [{ sourceUrl: null }, { NOT: { sourceUrl: { contains: "localhost" } } }],
};

const candidates: Source = {
  key: "candidates",
  label: "Candidates",
  description: "Applications from the madarth.com career form",
  roles: HR,
  measures: [{ key: "count", label: "Applications" }],
  dateFields: [{ key: "applied", label: "Applied on" }],
  fields: [
    { key: "stage", label: "Stage", labels: STAGE_LABELS },
    {
      key: "role",
      label: "Role applied for",
      param: "role",
      options: async () =>
        distinct((await db.candidate.findMany({ where: { AND: [NOT_SPAM, NOT_LOCAL] }, select: { jobRole: true }, distinct: ["jobRole"] })).map((row) => row.jobRole)),
    },
    { key: "position", label: "Full time or intern", labels: POSITION_LABELS, param: "position" },
  ],
  page: () => "/candidates",
  async load(context) {
    const rows = await db.candidate.findMany({
      where: candidateWhereFor(context),
      select: { createdAt: true, status: true, jobRole: true, position: true },
    });
    return rows.map((row) => ({
      day: dayOf(row.createdAt, "instant"),
      value: 1,
      keys: { stage: statusOf(row.status), role: row.jobRole ?? NONE, position: row.position ?? NONE },
    }));
  },
  count: (context) => db.candidate.count({ where: candidateWhereFor(context) }),
};

function candidateWhereFor({ range, filters }: LoadContext): Prisma.CandidateWhereInput {
  const and: Prisma.CandidateWhereInput[] = [NOT_SPAM, NOT_LOCAL];
  const bounds = instantBounds(range);
  if (bounds) and.push({ createdAt: bounds });
  const stages = pick(filters.stage, STAGE_LABELS) as CandidateStatus[];
  if (stages.length) and.push({ OR: stages.map(candidateStatusWhere) });
  const roles = list(filters.role);
  if (roles.length) and.push({ OR: roles.map((role) => ({ jobRole: { equals: role, mode: "insensitive" as const } })) });
  const positions = pick(filters.position, POSITION_LABELS);
  if (positions.length) and.push({ position: { in: positions } });
  return { AND: and };
}

// ------------------------------------------------------------ Quantum Sheet

const KIND_LABELS = Object.fromEntries(QUANTUM_KINDS.map((kind) => [kind.value, kind.label]));
const QUANTUM_STATUS_LABELS = Object.fromEntries(QUANTUM_STATUSES.map((status) => [status.value, status.label]));
const isTeamView = (viewer: Viewer) => viewer.role !== "EMPLOYEE";

async function projectOptions(viewer: Viewer): Promise<Option[]> {
  const projects = await db.quantumTodo.findMany({
    where: { status: { not: "trashed" }, ...(isTeamView(viewer) ? {} : { assigneeIds: { has: viewer.basecampPersonId ?? "-" } }) },
    select: { projectId: true, projectName: true },
    distinct: ["projectId"],
  });
  return sorted(projects.map((project) => ({ value: project.projectId, label: project.projectName })));
}

/** People with a Basecamp id: who logged hours or is assigned. */
async function basecampPeople(viewer: Viewer): Promise<Option[]> {
  const people = await db.employee.findMany({
    where: { basecampPersonId: { not: null }, ...(isTeamView(viewer) ? {} : { id: viewer.employeeId ?? "-" }) },
    select: { basecampPersonId: true, name: true },
  });
  return [...sorted(people.map((person) => ({ value: person.basecampPersonId!, label: person.name }))), { value: NONE, label: "Not in HCM" }];
}

const quantumHours: Source = {
  key: "quantumHours",
  label: "Quantum hours",
  description: "Hours logged on Basecamp to-dos (Basecamp timesheet, else HCM)",
  roles: EVERYONE,
  measures: [{ key: "hours", label: "Hours", unit: "h" }],
  dateFields: [{ key: "logged", label: "Logged for" }],
  fields: [
    { key: "project", label: "Project", options: projectOptions, param: "project" },
    { key: "person", label: "Person", options: basecampPeople, param: "person" },
    { key: "kind", label: "To-do type", labels: KIND_LABELS, param: "type" },
  ],
  page: () => "/quantum?view=timesheet",
  async load({ viewer, range, filters }) {
    const bounds = dateBounds(range);
    const mine: Prisma.QuantumHoursWhereInput = isTeamView(viewer)
      ? {}
      : { OR: [{ personId: viewer.basecampPersonId ?? "-" }, { employeeId: viewer.employeeId ?? "-" }] };
    const [rows, basecampTodos] = await Promise.all([
      db.quantumHours.findMany({
        where: { AND: [mine, bounds ? { date: bounds } : {}] },
        select: {
          todoBasecampId: true,
          source: true,
          minutes: true,
          date: true,
          personId: true,
          employee: { select: { basecampPersonId: true } },
        },
      }),
      // A to-do with Basecamp hours counts those only (as the Hours column).
      db.quantumHours.findMany({ where: { source: "basecamp" }, select: { todoBasecampId: true }, distinct: ["todoBasecampId"] }),
    ]);
    const usesBasecamp = new Set(basecampTodos.map((row) => row.todoBasecampId));
    const counted = rows.filter((row) => row.source === "basecamp" || !usesBasecamp.has(row.todoBasecampId));
    const todos = await db.quantumTodo.findMany({
      where: { basecampId: { in: [...new Set(counted.map((row) => row.todoBasecampId))] }, status: { not: "trashed" } },
      select: { basecampId: true, projectId: true, kind: true },
    });
    const todoById = new Map(todos.map((todo) => [todo.basecampId, todo]));
    const projects = list(filters.project);
    const people = list(filters.person);
    const kinds = pick(filters.kind, KIND_LABELS);
    return counted.flatMap((row) => {
      const todo = todoById.get(row.todoBasecampId);
      const person = row.personId ?? row.employee?.basecampPersonId ?? NONE;
      if (!todo) return [];
      if (projects.length && !projects.includes(todo.projectId)) return [];
      if (people.length && !people.includes(person)) return [];
      if (kinds.length && !kinds.includes(todo.kind)) return [];
      return [{ day: dayOf(row.date, "date"), value: row.minutes / 60, keys: { project: todo.projectId, person, kind: todo.kind } }];
    });
  },
};

const quantumTodos: Source = {
  key: "quantumTodos",
  label: "Quantum to-dos",
  description: "Basecamp to-dos, cards and steps (last 12 months)",
  roles: EVERYONE,
  measures: [{ key: "count", label: "To-dos" }],
  dateFields: [
    { key: "sheet", label: "Day on the sheet" },
    { key: "completed", label: "Completed on" },
    { key: "due", label: "Due on" },
  ],
  fields: [
    { key: "project", label: "Project", options: projectOptions, param: "project" },
    { key: "status", label: "Status", labels: QUANTUM_STATUS_LABELS, param: "status" },
    { key: "kind", label: "To-do type", labels: KIND_LABELS, param: "type" },
    { key: "assignee", label: "Assigned to", options: basecampPeople, param: "person" },
  ],
  page: () => "/quantum",
  async load(context) {
    const rows = await db.quantumTodo.findMany({
      where: todoWhere(context),
      select: { projectId: true, kind: true, completed: true, completedAt: true, dueOn: true, sheetDay: true, assigneeIds: true },
    });
    const overdueBefore = new Date(`${context.today}T00:00:00Z`);
    return rows.map((row) => {
      const date = context.dateField === "completed" ? row.completedAt : context.dateField === "due" ? row.dueOn : row.sheetDay;
      return {
        day: date ? dayOf(date, context.dateField === "completed" ? "instant" : "date") : null,
        value: 1,
        keys: {
          project: row.projectId,
          kind: row.kind,
          status: row.completed ? "completed" : row.dueOn && row.dueOn < overdueBefore ? "overdue" : "open",
          assignee: row.assigneeIds.length ? row.assigneeIds : NONE,
        },
      };
    });
  },
  count: (context) => db.quantumTodo.count({ where: todoWhere(context) }),
};

function todoWhere({ viewer, range, dateField, filters, today }: LoadContext): Prisma.QuantumTodoWhereInput {
  const and: Prisma.QuantumTodoWhereInput[] = [{ status: { not: "trashed" } }];
  if (!isTeamView(viewer)) and.push({ assigneeIds: { has: viewer.basecampPersonId ?? "-" } });
  if (dateField === "completed") {
    const bounds = instantBounds(range);
    if (bounds) and.push({ completedAt: bounds });
  } else {
    const bounds = dateBounds(range);
    if (bounds) and.push(dateField === "due" ? { dueOn: bounds } : { sheetDay: bounds });
  }
  if (list(filters.project).length) and.push({ projectId: { in: list(filters.project) } });
  const kinds = pick(filters.kind, KIND_LABELS);
  if (kinds.length) and.push({ kind: { in: kinds } });
  const byStatus = quantumStatusWhere(pick(filters.status, QUANTUM_STATUS_LABELS) as QuantumStatus[], today);
  if (byStatus) and.push(byStatus);
  const assignees = list(filters.assignee);
  if (assignees.length) and.push({ assigneeIds: { hasSome: assignees } });
  return { AND: and };
}

// ----------------------------------------------------------------- sessions

const MODE_LABELS = { IN_PERSON: "In-person", VIRTUAL: "Virtual" };

const sessions: Source = {
  key: "sessions",
  label: "Sessions",
  description: "Training sessions on the Session Calendar",
  roles: EVERYONE,
  measures: [{ key: "count", label: "Sessions" }],
  dateFields: [{ key: "date", label: "Session date" }],
  fields: [
    { key: "mode", label: "In-person or virtual", labels: MODE_LABELS },
    {
      key: "trainer",
      label: "Trainer",
      options: async () => distinct((await db.trainingSession.findMany({ select: { trainer: true }, distinct: ["trainer"] })).map((row) => row.trainer)),
    },
  ],
  page: () => "/sessions",
  async load(context) {
    const rows = await db.trainingSession.findMany({ where: sessionWhere(context), select: { date: true, mode: true, trainer: true } });
    return rows.map((row) => ({ day: dayOf(row.date, "instant"), value: 1, keys: { mode: row.mode, trainer: row.trainer } }));
  },
  count: (context) => db.trainingSession.count({ where: sessionWhere(context) }),
};

function sessionWhere({ range, filters }: LoadContext): Prisma.TrainingSessionWhereInput {
  const and: Prisma.TrainingSessionWhereInput[] = [];
  const bounds = instantBounds(range);
  if (bounds) and.push({ date: bounds });
  const modes = pick(filters.mode, MODE_LABELS);
  if (modes.length) and.push({ mode: { in: modes as never } });
  if (list(filters.trainer).length) and.push({ trainer: { in: list(filters.trainer) } });
  return { AND: and };
}

// ------------------------------------------------------------------ devices

function deviceScope(viewer: Viewer): Prisma.DeviceWhereInput {
  return viewer.role === "MANAGER" ? { holder: { manager: { userId: viewer.id } } } : {};
}

const devices: Source = {
  key: "devices",
  label: "Devices",
  description: "Laptops, phones and other company devices",
  roles: HR_OR_MANAGER,
  measures: [{ key: "count", label: "Devices" }],
  dateFields: [{ key: "purchased", label: "Purchased on" }],
  fields: [
    { key: "type", label: "Type", labels: DEVICE_TYPE_LABELS, param: "type" },
    { key: "status", label: "Status", labels: DEVICE_STATUS_LABELS, param: "status" },
    { key: "os", label: "OS", labels: { ...DEVICE_OS_LABELS, [NONE]: "No OS" }, param: "os" },
    { key: "ownership", label: "Owned or rented", labels: DEVICE_OWNERSHIP_LABELS, param: "ownership" },
    {
      key: "brand",
      label: "Brand",
      param: "brand",
      options: async (viewer) =>
        distinct((await db.device.findMany({ where: deviceScope(viewer), select: { brand: true }, distinct: ["brand"] })).map((row) => row.brand)),
    },
  ],
  page: () => "/devices",
  async load(context) {
    const rows = await db.device.findMany({
      where: deviceWhere(context),
      select: { purchaseDate: true, type: true, status: true, os: true, ownership: true, brand: true },
    });
    return rows.map((row) => ({
      day: row.purchaseDate ? dayOf(row.purchaseDate, "date") : null,
      value: 1,
      keys: { type: row.type, status: row.status, os: row.os ?? NONE, ownership: row.ownership, brand: row.brand },
    }));
  },
  count: (context) => db.device.count({ where: deviceWhere(context) }),
};

function deviceWhere({ viewer, range, filters }: LoadContext): Prisma.DeviceWhereInput {
  const and: Prisma.DeviceWhereInput[] = [deviceScope(viewer)];
  const bounds = dateBounds(range);
  if (bounds) and.push({ purchaseDate: bounds });
  const types = pick(filters.type, DEVICE_TYPE_LABELS);
  if (types.length) and.push({ type: { in: types as never } });
  const statuses = pick(filters.status, DEVICE_STATUS_LABELS);
  if (statuses.length) and.push({ status: { in: statuses as never } });
  const oses = pick(filters.os, { ...DEVICE_OS_LABELS, [NONE]: "" });
  if (oses.length)
    and.push({
      OR: [{ os: { in: oses.filter((os) => os !== NONE) as never } }, ...(oses.includes(NONE) ? [{ os: null }] : [])],
    });
  const ownerships = pick(filters.ownership, DEVICE_OWNERSHIP_LABELS);
  if (ownerships.length) and.push({ ownership: { in: ownerships as never } });
  if (list(filters.brand).length) and.push({ brand: { in: list(filters.brand) } });
  return { AND: and };
}

// ---------------------------------------------------------------- probation

const PROBATION_LABELS = { PENDING: "Pending", EXTENDED: "Extended", CONFIRMED: "Confirmed", EXITED: "Left" };

const probation: Source = {
  key: "probation",
  label: "Probation",
  description: "Probation confirmations",
  roles: HR_OR_MANAGER,
  measures: [{ key: "count", label: "People" }],
  dateFields: [{ key: "due", label: "Confirmation due" }],
  fields: [
    { key: "status", label: "Status", labels: PROBATION_LABELS },
    {
      key: "department",
      label: "Department",
      param: "department",
      options: async (viewer) =>
        distinct(
          (
            await db.employee.findMany({ where: { ...teamWhere(viewer), probation: { isNot: null } }, select: { department: true }, distinct: ["department"] })
          ).map((row) => row.department),
        ),
    },
  ],
  page: () => "/probation",
  async load(context) {
    const rows = await db.probationRecord.findMany({
      where: probationWhere(context),
      select: { dueDate: true, status: true, employee: { select: { department: true } } },
    });
    return rows.map((row) => ({
      day: dayOf(row.dueDate, "date"),
      value: 1,
      keys: { status: row.status, department: row.employee.department },
    }));
  },
  count: (context) => db.probationRecord.count({ where: probationWhere(context) }),
};

function probationWhere({ viewer, range, filters }: LoadContext): Prisma.ProbationRecordWhereInput {
  const and: Prisma.ProbationRecordWhereInput[] = [{ employee: teamWhere(viewer) }];
  const bounds = dateBounds(range);
  if (bounds) and.push({ dueDate: bounds });
  const statuses = pick(filters.status, PROBATION_LABELS);
  if (statuses.length) and.push({ status: { in: statuses as never } });
  if (list(filters.department).length) and.push({ employee: { department: { in: list(filters.department) } } });
  return { AND: and };
}

// ----------------------------------------------------------------- ID cards

const ID_CARD_LABELS: Record<string, string> = Object.fromEntries(ID_CARD_STATUSES);

const idCards: Source = {
  key: "idCards",
  label: "ID cards",
  description: "ID card printing and returns",
  roles: HR,
  measures: [{ key: "count", label: "Cards" }],
  dateFields: [{ key: "issued", label: "Issued on" }],
  fields: [{ key: "status", label: "Status", labels: ID_CARD_LABELS, param: "type" }],
  page: () => "/id-cards",
  async load(context) {
    const rows = await db.idCard.findMany({ where: idCardWhere(context), select: { issuedAt: true, status: true } });
    return rows.map((row) => ({ day: row.issuedAt ? dayOf(row.issuedAt, "instant") : null, value: 1, keys: { status: row.status } }));
  },
  count: (context) => db.idCard.count({ where: idCardWhere(context) }),
};

function idCardWhere({ range, filters }: LoadContext): Prisma.IdCardWhereInput {
  const and: Prisma.IdCardWhereInput[] = [];
  const bounds = instantBounds(range);
  if (bounds) and.push({ issuedAt: bounds });
  const statuses = pick(filters.status, ID_CARD_LABELS);
  if (statuses.length) and.push({ status: { in: statuses as never } });
  return { AND: and };
}

// -------------------------------------------------------------- freelancers

const WORK_MODE_LABELS = { REMOTE: "Remote", ONSITE: "Onsite", FLEXIBLE: "Flexible" };

const freelancers: Source = {
  key: "freelancers",
  label: "Freelancers",
  description: "The freelancer directory",
  roles: HR_OR_MANAGER,
  measures: [{ key: "count", label: "Freelancers" }],
  dateFields: [{ key: "added", label: "Added on" }],
  fields: [
    { key: "workMode", label: "Status", labels: WORK_MODE_LABELS, param: "type" },
    {
      key: "skillset",
      label: "Skills",
      options: async () =>
        distinct((await db.freelancer.findMany({ select: { skillset: true }, distinct: ["skillset"], take: 300 })).map((row) => row.skillset)),
    },
  ],
  page: () => "/freelancers",
  async load(context) {
    const rows = await db.freelancer.findMany({
      where: freelancerWhere(context),
      select: { createdAt: true, workMode: true, skillset: true },
    });
    return rows.map((row) => ({ day: dayOf(row.createdAt, "instant"), value: 1, keys: { workMode: row.workMode ?? "", skillset: row.skillset } }));
  },
  count: (context) => db.freelancer.count({ where: freelancerWhere(context) }),
};

function freelancerWhere({ range, filters }: LoadContext): Prisma.FreelancerWhereInput {
  const and: Prisma.FreelancerWhereInput[] = [];
  const bounds = instantBounds(range);
  if (bounds) and.push({ createdAt: bounds });
  const workMode = pick(filters.workMode, WORK_MODE_LABELS);
  if (workMode.length) and.push({ workMode: { in: workMode as never } });
  if (list(filters.skillset).length) and.push({ skillset: { in: list(filters.skillset) } });
  return { AND: and };
}

// ----------------------------------------------------------------- registry

export const SOURCES: Record<SourceKey, Source> = {
  employees,
  leave,
  candidates,
  quantumHours,
  quantumTodos,
  sessions,
  devices,
  probation,
  idCards,
  freelancers,
};

export const NONE_VALUE = NONE;

export const canUseSource = (source: Source, role: Role) => source.roles.includes(role);

/** Labels for a field's values: fixed ones, else the viewer's options. */
export async function fieldLabels(field: FieldDef, viewer: Viewer): Promise<Map<string, string>> {
  const options = field.labels
    ? Object.entries(field.labels).map(([value, label]) => ({ value, label }))
    : field.options
      ? await field.options(viewer)
      : [];
  const labels = new Map(options.map((option) => [option.value, option.label]));
  if (!labels.has(NONE)) labels.set(NONE, "None");
  return labels;
}

/** What the builder needs about each source the viewer may use (serialisable). */
export type SourceMeta = {
  key: SourceKey;
  label: string;
  description: string;
  measures: { key: string; label: string }[];
  dateFields: { key: string; label: string }[];
  fields: { key: string; label: string; group: boolean; filter: boolean; options: Option[] | null }[];
};

export function sourceMeta(role: Role): SourceMeta[] {
  return Object.values(SOURCES)
    .filter((source) => canUseSource(source, role))
    .map((source) => ({
      key: source.key,
      label: source.label,
      description: source.description,
      measures: source.measures.map(({ key, label }) => ({ key, label })),
      dateFields: source.dateFields,
      fields: source.fields.map((field) => ({
        key: field.key,
        label: field.label,
        group: field.group ?? true,
        filter: field.filter ?? true,
        // Fixed values travel with the meta; data values load on demand.
        options: field.labels ? Object.entries(field.labels).map(([value, label]) => ({ value, label })) : null,
      })),
    }));
}
