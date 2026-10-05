import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { readPii } from "@/lib/employee-pii";
import { formatDateTime, formatDay, formatInstantDay, formatSessionTime } from "@/lib/format-date";
import { istDay } from "@/lib/date-filter";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/leave";
import {
  DEVICE_OWNERSHIP_LABELS,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/devices/devices";
import { osSuffix } from "@/lib/devices/os";
import { VENDOR_KIND_LABELS } from "@/lib/devices/vendors";
import {
  addNoteToCandidate,
  confirmProbationRecord,
  contactSchema,
  createQuantumEntry,
  extendProbationRecord,
  ProbationStateError,
  moveCandidate,
  saveContact,
  setLeaveDecision,
} from "@/lib/hcm-ops";
import { CANDIDATE_STATUSES } from "@/app/(app)/candidates/statuses";
import {
  NOT_SPAM,
  candidateWhere,
  statusOf,
  statusWhere,
} from "@/app/(app)/candidates/query";
import { parseNotes } from "@/app/(app)/candidates/notes";

// MadMax's tools. Which tools exist depends on the user's role, and every
// execute re-checks scope against the signed-in user — never against what
// the model passed in. Write tools only run after the user approves them in
// the chat (see WRITE_TOOLS / toolApproval in the route).

export type MadmaxContext = {
  user: SessionUser;
  /** The signed-in user's employee record, when HR has linked one. */
  employeeId: string | null;
  displayName: string;
};

/** Tools that change data; each needs the user's approval in the chat. */
export const WRITE_TOOLS = [
  "updateMyContact",
  "addMyQuantumEntry",
  "reviewLeave",
  "setCandidateStatus",
  "addCandidateNote",
  "confirmProbation",
  "extendProbation",
] as const;

const EVERYONE = [
  "getMyProfile",
  "listDevices",
  "getDevice",
  "listMyQuantumEntries",
  "listMyLeave",
  "listMySessions",
  "updateMyContact",
  "addMyQuantumEntry",
];
const MANAGER = ["listMyReports", "getEmployee", "listLeave", "reviewLeave"];
const HR = [
  "searchEmployees",
  "searchCandidates",
  "getCandidate",
  "listProbationDue",
  "listOnboarding",
  "setCandidateStatus",
  "addCandidateNote",
  "confirmProbation",
  "extendProbation",
  "listVendors",
  "listDeviceRequests",
];

/** Tool names available to a role (the route and tests use this). */
export function toolNamesFor(role: SessionUser["role"]): string[] {
  if (role === "HR_ADMIN") return [...EVERYONE, ...MANAGER, ...HR];
  if (role === "MANAGER") return [...EVERYONE, ...MANAGER];
  return [...EVERYONE];
}

/** The caller's employee record: linked user, else matching work email. */
export async function loadContext(user: SessionUser): Promise<MadmaxContext> {
  const [account, employee] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    db.employee.findFirst({
      where: { OR: [{ userId: user.id }, { workEmail: user.email }] },
      select: { id: true, name: true },
    }),
  ]);
  return {
    user,
    employeeId: employee?.id ?? null,
    displayName: account?.name || employee?.name || user.email.split("@")[0],
  };
}

/** Employees this user may see beyond themselves. */
export function employeeScope(
  context: MadmaxContext,
): Prisma.EmployeeWhereInput {
  if (context.user.role === "HR_ADMIN") return {};
  if (context.user.role === "MANAGER") {
    return { manager: { userId: context.user.id } };
  }
  return { id: context.employeeId ?? "__none__" };
}

function requireOwnEmployee(context: MadmaxContext): string {
  if (!context.employeeId) {
    throw new Error(
      "No employee record is linked to this login. Ask HR to set your work email.",
    );
  }
  return context.employeeId;
}

async function requireEmployeeInScope(
  context: MadmaxContext,
  employeeId: string,
) {
  const employee = await db.employee.findFirst({
    where: { AND: [{ id: employeeId }, employeeScope(context)] },
    select: { id: true },
  });
  if (!employee) throw new Error("That employee isn't in your scope.");
}

const CAP = 25;
const limit = z.number().int().min(1).max(50).optional();

function leaveRow(entry: {
  id: string;
  type: keyof typeof LEAVE_TYPE_LABELS | null;
  status: keyof typeof LEAVE_STATUS_LABELS;
  startDate: Date | null;
  endDate: Date | null;
  postedOn: Date;
  days: Prisma.Decimal | null;
  reason: string | null;
  employee?: { name: string; empId: string } | null;
  creatorName?: string;
}) {
  return {
    id: entry.id,
    employee: entry.employee
      ? `${entry.employee.name} (${entry.employee.empId})`
      : entry.creatorName,
    type: entry.type ? LEAVE_TYPE_LABELS[entry.type] : "Unclassified",
    from: formatDay(entry.startDate ?? entry.postedOn),
    to: entry.endDate ? formatDay(entry.endDate) : undefined,
    days: entry.days !== null ? Number(entry.days) : null,
    reason: entry.reason,
    status: LEAVE_STATUS_LABELS[entry.status],
  };
}

const leaveSelect = {
  id: true,
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  postedOn: true,
  days: true,
  reason: true,
  creatorName: true,
  employee: { select: { name: true, empId: true } },
} satisfies Prisma.LeaveEntrySelect;

function yearStart(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}

export function buildTools(context: MadmaxContext): ToolSet {
  const today = istDay();
  const all: ToolSet = {
    getMyProfile: tool({
      description:
        "The signed-in user's own employee record: job details, probation, contact info.",
      inputSchema: z.object({}),
      execute: async () => {
        const employeeId = requireOwnEmployee(context);
        const employee = await db.employee.findUniqueOrThrow({
          where: { id: employeeId },
          include: {
            probation: true,
            manager: { select: { name: true } },
          },
        });
        const pii = readPii(employee);
        return {
          name: employee.name,
          empId: employee.empId,
          designation: employee.designation,
          department: employee.department,
          employmentType: employee.empType,
          joined: formatDay(employee.dateOfJoining),
          manager: employee.manager?.name ?? null,
          probation: employee.probation
            ? `${employee.probation.status}, due ${formatDay(employee.probation.dueDate)}`
            : null,
          contact: {
            phone: pii.phone,
            personalEmail: pii.personalEmail,
            emergencyContact: pii.emergencyContact,
            fatherName: employee.fatherName,
            address: pii.address,
            city: employee.city,
            state: employee.state,
            pincode: employee.pincode,
          },
        };
      },
    }),

    listMyQuantumEntries: tool({
      description:
        "The signed-in user's Quantum Sheet work log, newest first. Dates are YYYY-MM-DD.",
      inputSchema: z.object({
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        limit,
      }),
      execute: async ({ from, to, limit: take }) => {
        const employeeId = requireOwnEmployee(context);
        const entries = await db.quantumEntry.findMany({
          where: {
            employeeId,
            date: {
              gte: from ? new Date(`${from}T00:00:00Z`) : undefined,
              lte: to ? new Date(`${to}T00:00:00Z`) : undefined,
            },
          },
          orderBy: { date: "desc" },
          take: take ?? CAP,
        });
        return entries.map((entry) => ({
          date: formatDay(entry.date),
          brand: entry.brand,
          work: entry.workName,
          minutes: entry.durationMins,
        }));
      },
    }),

    listMyLeave: tool({
      description:
        "The signed-in user's leave and WFH posts for a year, with total leave days.",
      inputSchema: z.object({
        year: z.number().int().min(2020).max(2100).optional(),
      }),
      execute: async ({ year }) => {
        const employeeId = requireOwnEmployee(context);
        const targetYear = year ?? Number(today.slice(0, 4));
        const where = {
          employeeId,
          OR: [
            {
              startDate: {
                gte: yearStart(targetYear),
                lt: yearStart(targetYear + 1),
              },
            },
            {
              startDate: null,
              postedOn: {
                gte: yearStart(targetYear),
                lt: yearStart(targetYear + 1),
              },
            },
          ],
        } satisfies Prisma.LeaveEntryWhereInput;
        const [entries, totals] = await Promise.all([
          db.leaveEntry.findMany({
            where,
            orderBy: { postedOn: "desc" },
            take: 60,
            select: leaveSelect,
          }),
          db.leaveEntry.aggregate({
            where: {
              ...where,
              type: { in: ["FULL_DAY", "HALF_DAY"] },
              status: { not: "REJECTED" },
            },
            _sum: { days: true },
          }),
        ]);
        return {
          year: targetYear,
          leaveDays: Number(totals._sum.days ?? 0),
          entries: entries.map(leaveRow),
        };
      },
    }),

    listMySessions: tool({
      description:
        "Training sessions the signed-in user is registered for (upcoming) and has attended.",
      inputSchema: z.object({}),
      execute: async () => {
        const employeeId = requireOwnEmployee(context);
        const [registrations, attendance] = await Promise.all([
          db.sessionRegistration.findMany({
            where: { employeeId, session: { date: { gte: new Date() } } },
            include: { session: true },
            orderBy: { session: { date: "asc" } },
          }),
          db.sessionAttendance.findMany({
            where: { employeeId },
            orderBy: { date: "desc" },
            take: 15,
          }),
        ]);
        return {
          upcoming: registrations.map((registration) => ({
            name: registration.session.name,
            when: formatSessionTime(registration.session.date),
            trainer: registration.session.trainer,
          })),
          attended: attendance.map((record) => ({
            name: record.sessionName,
            date: formatDay(record.date),
            attended: record.attended,
          })),
        };
      },
    }),

    updateMyContact: tool({
      description:
        "Update the signed-in user's own contact details. Only pass the fields that change.",
      inputSchema: z.object({
        phone: z.string().optional(),
        personalEmail: z.string().optional(),
        emergencyContact: z.string().optional(),
        fatherName: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
      }),
      execute: async (changes) => {
        const employeeId = requireOwnEmployee(context);
        const employee = await db.employee.findUniqueOrThrow({
          where: { id: employeeId },
        });
        const pii = readPii(employee);
        const merged = contactSchema.parse({
          phone: changes.phone ?? pii.phone ?? "",
          personalEmail: changes.personalEmail ?? pii.personalEmail ?? "",
          emergencyContact:
            changes.emergencyContact ?? pii.emergencyContact ?? undefined,
          fatherName: changes.fatherName ?? employee.fatherName ?? undefined,
          address: changes.address ?? pii.address ?? undefined,
          city: changes.city ?? employee.city ?? undefined,
          state: changes.state ?? employee.state ?? undefined,
          pincode: changes.pincode ?? employee.pincode ?? undefined,
        });
        await saveContact(employeeId, merged);
        return { updated: Object.keys(changes) };
      },
    }),

    addMyQuantumEntry: tool({
      description:
        "Log work on the signed-in user's Quantum Sheet. Date is YYYY-MM-DD (default today).",
      inputSchema: z.object({
        date: z.iso.date().optional(),
        brand: z.string().trim().min(1),
        workName: z.string().trim().min(1),
        durationMins: z
          .number()
          .int()
          .min(0)
          .max(24 * 60),
        link: z.url().optional(),
      }),
      execute: async ({ date, brand, workName, durationMins, link }) => {
        const employeeId = requireOwnEmployee(context);
        await createQuantumEntry({
          employeeId,
          date: new Date(`${date ?? today}T00:00:00Z`),
          brand,
          workName,
          durationMins,
          link,
        });
        return { logged: true, date: formatDay(date ?? today) };
      },
    }),

    listMyReports: tool({
      description:
        "Employees the user manages (HR admins: everyone), with job details.",
      inputSchema: z.object({ limit }),
      execute: async ({ limit: take }) => {
        const employees = await db.employee.findMany({
          where: { AND: [employeeScope(context), { dateOfExit: null }] },
          orderBy: { name: "asc" },
          take: take ?? 50,
        });
        return employees.map(employeeRow);
      },
    }),

    getEmployee: tool({
      description:
        "One employee's job details, probation and recent leave, by employee ID (e.g. PBCH0145) or name.",
      inputSchema: z.object({ query: z.string().trim().min(1) }),
      execute: async ({ query }) => {
        const employee = await db.employee.findFirst({
          where: {
            AND: [
              employeeScope(context),
              {
                OR: [
                  { empId: { equals: query, mode: "insensitive" } },
                  { name: { contains: query, mode: "insensitive" } },
                ],
              },
            ],
          },
          include: {
            probation: true,
            manager: { select: { name: true } },
            leaveEntries: {
              orderBy: { postedOn: "desc" },
              take: 10,
              select: leaveSelect,
            },
          },
        });
        if (!employee) return { found: false };
        return {
          ...employeeRow(employee),
          manager: employee.manager?.name ?? null,
          probation: employee.probation
            ? `${employee.probation.status}, due ${formatDay(employee.probation.dueDate)}`
            : null,
          recentLeave: employee.leaveEntries.map(leaveRow),
        };
      },
    }),

    listLeave: tool({
      description:
        "Leave and WFH posts for the employees the user manages (HR admins: everyone). Dates are YYYY-MM-DD.",
      inputSchema: z.object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        limit,
      }),
      execute: async ({ status, from, to, limit: take }) => {
        const entries = await db.leaveEntry.findMany({
          where: {
            employee: employeeScope(context),
            status,
            postedOn: {
              gte: from ? new Date(`${from}T00:00:00Z`) : undefined,
              lte: to ? new Date(`${to}T00:00:00Z`) : undefined,
            },
          },
          orderBy: { postedOn: "desc" },
          take: take ?? CAP,
          select: leaveSelect,
        });
        return entries.map(leaveRow);
      },
    }),

    reviewLeave: tool({
      description:
        "Approve or reject a leave post by its id (from listLeave). PENDING undoes a decision.",
      inputSchema: z.object({
        entryId: z.string().min(1),
        decision: z.enum(["APPROVED", "REJECTED", "PENDING"]),
      }),
      execute: async ({ entryId, decision }) => {
        const entry = await db.leaveEntry.findUnique({
          where: { id: entryId },
          select: { employeeId: true },
        });
        if (!entry?.employeeId) throw new Error("Leave post not found.");
        await requireEmployeeInScope(context, entry.employeeId);
        await setLeaveDecision(entryId, decision, context.user.id);
        return { entryId, status: LEAVE_STATUS_LABELS[decision] };
      },
    }),

    searchEmployees: tool({
      description:
        "Search current employees by name, department, designation or employment type.",
      inputSchema: z.object({
        query: z.string().optional(),
        department: z.string().optional(),
        empType: z
          .enum(["INTERN", "PROBATION", "PERMANENT", "CONTRACT"])
          .optional(),
        limit,
      }),
      execute: async ({ query, department, empType, limit: take }) => {
        const employees = await db.employee.findMany({
          where: {
            dateOfExit: null,
            empType,
            department: department
              ? { equals: department, mode: "insensitive" }
              : undefined,
            OR: query
              ? [
                  { name: { contains: query, mode: "insensitive" } },
                  { empId: { contains: query, mode: "insensitive" } },
                  { designation: { contains: query, mode: "insensitive" } },
                ]
              : undefined,
          },
          orderBy: { name: "asc" },
          take: take ?? CAP,
        });
        return employees.map(employeeRow);
      },
    }),

    searchCandidates: tool({
      description:
        "Search job applicants by name/email/phone/role words and status.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.enum(CANDIDATE_STATUSES).optional(),
        role: z.string().optional(),
        limit,
      }),
      execute: async ({ query, status, role, limit: take }) => {
        const where = {
          AND: [
            ...candidateWhere({ q: query, role }),
            ...(status ? [statusWhere(status)] : []),
          ],
        };
        const [rows, total] = await Promise.all([
          db.candidate.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: take ?? CAP,
          }),
          db.candidate.count({ where }),
        ]);
        return {
          total,
          candidates: rows.map((candidate) => ({
            id: String(candidate.id),
            name: [candidate.firstName, candidate.lastName]
              .filter(Boolean)
              .join(" "),
            role: candidate.jobRole,
            position: candidate.position,
            status: statusOf(candidate.status),
            applied: formatInstantDay(candidate.createdAt),
          })),
        };
      },
    }),

    getCandidate: tool({
      description: "One job applicant's details and HR notes, by id.",
      inputSchema: z.object({ candidateId: z.string().regex(/^\d+$/) }),
      execute: async ({ candidateId }) => {
        const candidate = await db.candidate.findFirst({
          where: { AND: [{ id: BigInt(candidateId) }, NOT_SPAM] },
        });
        if (!candidate) return { found: false };
        return {
          id: candidateId,
          name: [candidate.firstName, candidate.lastName]
            .filter(Boolean)
            .join(" "),
          email: candidate.email,
          phone: candidate.mobileNumber,
          role: candidate.jobRole,
          position: candidate.position,
          location: candidate.location,
          status: statusOf(candidate.status),
          applied: formatInstantDay(candidate.createdAt),
          notes: parseNotes(candidate.notes).map((note) => note.text),
        };
      },
    }),

    listProbationDue: tool({
      description:
        "Probation confirmations due (pending or extended) within the next N days, overdue first.",
      inputSchema: z.object({
        withinDays: z.number().int().min(1).max(365).optional(),
      }),
      execute: async ({ withinDays }) => {
        const until = new Date(
          Date.parse(`${today}T00:00:00Z`) + (withinDays ?? 30) * 86_400_000,
        );
        const records = await db.probationRecord.findMany({
          where: {
            status: { in: ["PENDING", "EXTENDED"] },
            dueDate: { lte: until },
          },
          include: { employee: { select: { name: true, empId: true } } },
          orderBy: { dueDate: "asc" },
          take: 50,
        });
        return records.map((record) => ({
          probationId: record.id,
          employee: `${record.employee.name} (${record.employee.empId})`,
          status: record.status,
          due: formatDay(record.dueDate),
        }));
      },
    }),

    listOnboarding: tool({
      description: "Recent joiners from the onboarding log, newest first.",
      inputSchema: z.object({ limit }),
      execute: async ({ limit: take }) => {
        const records = await db.onboardingRecord.findMany({
          orderBy: { joinDate: "desc" },
          take: take ?? 15,
          include: { employee: { select: { name: true, empId: true } } },
        });
        return records.map((record) => ({
          employee: `${record.employee.name} (${record.employee.empId})`,
          designation: record.designation,
          type: record.empType,
          joined: formatDay(record.joinDate),
        }));
      },
    }),

    setCandidateStatus: tool({
      description: `Move a job applicant to another status (${CANDIDATE_STATUSES.join(", ")}).`,
      inputSchema: z.object({
        candidateId: z.string().regex(/^\d+$/),
        status: z.enum(CANDIDATE_STATUSES),
      }),
      execute: async ({ candidateId, status }) => {
        await moveCandidate(BigInt(candidateId), status, context.user.id);
        return { candidateId, status };
      },
    }),

    addCandidateNote: tool({
      description: "Add an HR note to a job applicant.",
      inputSchema: z.object({
        candidateId: z.string().regex(/^\d+$/),
        text: z.string().trim().min(1).max(5000),
      }),
      execute: async ({ candidateId, text }) => {
        await addNoteToCandidate(BigInt(candidateId), text);
        return { candidateId, added: true };
      },
    }),

    confirmProbation: tool({
      description:
        "Confirm an employee's probation (makes them Permanent). Use probationId from listProbationDue.",
      inputSchema: z.object({ probationId: z.string().min(1) }),
      execute: async ({ probationId }) => {
        try {
          await confirmProbationRecord(probationId);
        } catch (error) {
          if (error instanceof ProbationStateError) return { probationId, error: error.message };
          throw error;
        }
        return { probationId, status: "CONFIRMED" };
      },
    }),

    extendProbation: tool({
      description:
        "Extend an employee's probation to a new date (YYYY-MM-DD), with an optional note.",
      inputSchema: z.object({
        probationId: z.string().min(1),
        extendedTo: z.iso.date(),
        notes: z.string().max(2000).optional(),
      }),
      execute: async ({ probationId, extendedTo, notes }) => {
        try {
          await extendProbationRecord(
            probationId,
            new Date(`${extendedTo}T00:00:00Z`),
            notes,
          );
        } catch (error) {
          if (error instanceof ProbationStateError) return { probationId, error: error.message };
          throw error;
        }
        return { probationId, extendedTo: formatDay(extendedTo) };
      },
    }),
  };

  // --- Devices (read only). Employees: their own; managers: their team;
  // HR: everything, plus vendors and purchase requests. Rent and purchase
  // prices are HR only.
  const deviceScope: Prisma.DeviceWhereInput =
    context.user.role === "HR_ADMIN"
      ? {}
      : context.user.role === "MANAGER"
        ? { OR: [{ holder: { manager: { userId: context.user.id } } }, { holderId: context.employeeId ?? "__none__" }] }
        : { holderId: context.employeeId ?? "__none__" };
  const isHr = context.user.role === "HR_ADMIN";
  const deviceRow = (device: {
    assetTag: string;
    type: keyof typeof DEVICE_TYPE_LABELS;
    os: Parameters<typeof osSuffix>[0];
    brand: string;
    model: string;
    status: keyof typeof DEVICE_STATUS_LABELS;
    ownership: keyof typeof DEVICE_OWNERSHIP_LABELS;
    monthlyRent: Prisma.Decimal | null;
    serialNumber: string | null;
    holder: { name: string; empId: string } | null;
    vendor: { name: string } | null;
  }) => ({
    assetTag: device.assetTag,
    device: `${DEVICE_TYPE_LABELS[device.type]}${osSuffix(device.os)} · ${device.brand} ${device.model}`,
    serialNumber: device.serialNumber,
    status: DEVICE_STATUS_LABELS[device.status],
    holder: device.holder ? `${device.holder.name} (${device.holder.empId})` : null,
    ownership: DEVICE_OWNERSHIP_LABELS[device.ownership],
    vendor: device.vendor?.name ?? null,
    ...(isHr && device.monthlyRent ? { monthlyRentInr: Number(device.monthlyRent) } : {}),
  });
  const deviceSelect = {
    assetTag: true,
    type: true,
    os: true,
    brand: true,
    model: true,
    status: true,
    ownership: true,
    monthlyRent: true,
    serialNumber: true,
    holder: { select: { name: true, empId: true } },
    vendor: { select: { name: true } },
  } as const;

  Object.assign(all, {
    listDevices: tool({
      description:
        "Company devices (laptops, mice, iPads, USB hubs) the user may see: their own; managers also their team's; HR all. Filter by status or holder.",
      inputSchema: z.object({
        status: z.enum(["IN_STOCK", "ASSIGNED", "IN_SERVICE", "RETIRED", "LOST"]).optional(),
        query: z.string().trim().optional().describe("Asset tag, model, serial, or holder name / employee ID"),
        limit,
      }),
      execute: async ({ status, query, limit: take }: { status?: keyof typeof DEVICE_STATUS_LABELS; query?: string; limit?: number }) => {
        const devices = await db.device.findMany({
          where: {
            AND: [
              deviceScope,
              status ? { status } : {},
              query
                ? {
                    OR: [
                      { assetTag: { contains: query, mode: "insensitive" } },
                      { model: { contains: query, mode: "insensitive" } },
                      { serialNumber: { contains: query, mode: "insensitive" } },
                      { holder: { name: { contains: query, mode: "insensitive" } } },
                      { holder: { empId: { contains: query, mode: "insensitive" } } },
                    ],
                  }
                : {},
            ],
          },
          orderBy: { assetTag: "asc" },
          take: take ?? CAP,
          select: deviceSelect,
        });
        return devices.map(deviceRow);
      },
    }),

    getDevice: tool({
      description: "One device by asset tag or serial number, with its holder history and issues.",
      inputSchema: z.object({ tag: z.string().trim().min(1) }),
      execute: async ({ tag }: { tag: string }) => {
        const device = await db.device.findFirst({
          where: {
            AND: [
              deviceScope,
              {
                OR: [
                  { assetTag: { equals: tag, mode: "insensitive" } },
                  { stockTag: { equals: tag, mode: "insensitive" } },
                  { serialNumber: { equals: tag, mode: "insensitive" } },
                ],
              },
            ],
          },
          select: {
            ...deviceSelect,
            assignments: {
              orderBy: { assignedAt: "desc" },
              take: 10,
              select: { assignedAt: true, returnedAt: true, employee: { select: { name: true, empId: true } } },
            },
            tickets: {
              orderBy: { createdAt: "desc" },
              take: 10,
              select: { title: true, status: true, createdAt: true, serviceVendor: { select: { name: true } } },
            },
          },
        });
        if (!device) return { found: false };
        return {
          ...deviceRow(device),
          history: device.assignments.map((row) => ({
            holder: `${row.employee.name} (${row.employee.empId})`,
            from: formatDay(row.assignedAt),
            to: row.returnedAt ? formatDay(row.returnedAt) : "now",
          })),
          issues: device.tickets.map((ticket) => ({
            title: ticket.title,
            status: TICKET_STATUS_LABELS[ticket.status],
            reported: formatInstantDay(ticket.createdAt),
            serviceCentre: ticket.serviceVendor?.name ?? null,
          })),
        };
      },
    }),

    listVendors: tool({
      description: "Device vendors (shops and service centres) with contact people, phone and email. HR only.",
      inputSchema: z.object({}),
      execute: async () => {
        const vendors = await db.vendor.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          include: {
            contacts: { orderBy: [{ isPrimary: "desc" }, { position: "asc" }] },
            _count: { select: { devices: true } },
          },
        });
        return vendors.map((vendor) => ({
          name: vendor.name,
          does: VENDOR_KIND_LABELS[vendor.kind],
          phone: vendor.phone,
          altPhone: vendor.altPhone,
          email: vendor.email,
          devices: vendor._count.devices,
          contacts: vendor.contacts.map((contact) => ({
            name: contact.name,
            role: contact.role,
            email: contact.email,
            phone: contact.phone,
            primary: contact.isPrimary,
          })),
        }));
      },
    }),

    listDeviceRequests: tool({
      description: "Devices asked for from vendors by email, newest first, with status. HR only.",
      inputSchema: z.object({ open: z.boolean().optional().describe("Only those not yet received or cancelled") }),
      execute: async ({ open }: { open?: boolean }) => {
        const requests = await db.devicePurchaseRequest.findMany({
          where: open ? { status: { in: ["PENDING", "SENT"] } } : {},
          orderBy: { createdAt: "desc" },
          take: CAP,
          include: { vendor: { select: { name: true } }, employee: { select: { name: true, empId: true } } },
        });
        return requests.map((request) => ({
          item: `${request.quantity} × ${request.itemName}`,
          vendor: request.vendor.name,
          status: request.status,
          for: request.employee ? `${request.employee.name} (${request.employee.empId})` : null,
          sentAt: request.sentAt ? formatDateTime(request.sentAt) : null,
          neededBy: request.neededBy ? formatDay(request.neededBy) : null,
        }));
      },
    }),
  });

  const allowed = new Set(toolNamesFor(context.user.role));
  return Object.fromEntries(
    Object.entries(all).filter(([name]) => allowed.has(name)),
  );
}

function employeeRow(employee: {
  empId: string;
  name: string;
  designation: string;
  department: string;
  empType: string;
  dateOfJoining: Date;
  workEmail: string;
}) {
  return {
    empId: employee.empId,
    name: employee.name,
    designation: employee.designation,
    department: employee.department,
    employmentType: employee.empType,
    joined: formatDay(employee.dateOfJoining),
    workEmail: employee.workEmail,
  };
}
