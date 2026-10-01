"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { addEmployeeToBasecamp, type BasecampOnboardResult } from "@/lib/basecamp-onboard";
import { notifyTypeChange } from "@/lib/employment-emails";
import { blindIndex, encryptField, normalizeIdentifier } from "@/lib/crypto";
import { deleteDocument, uploadDocument } from "@/lib/blob";
import { encryptPii } from "@/lib/employee-pii";
import { provisionLogin } from "@/lib/logins";
import { appendNote } from "../candidates/notes";
import { istDay } from "@/lib/date-filter";
import {
  hasTypeEnd,
  resolveTypeEnd,
  typeEndUpdateData,
  type EmpTypeValue,
} from "./type-end";
import {
  parsePreviousEmployments,
  previousEmploymentsCreate,
  previousEmploymentsSync,
} from "./previous-employments";
import {
  cell,
  collectRows,
  importSummary,
  parseCsvBoolean,
  parseCsvFile,
  type ImportState,
} from "@/lib/csv-import";
import type { Prisma } from "@/generated/prisma/client";

export type EmployeeFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const employeeSchema = z.object({
  empId: z.string().trim().min(1, "Employee ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  // The form's "—" option posts "" — treat it as not set.
  gender: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  ),
  dateOfBirth: optionalTrimmed,
  bloodGroup: optionalTrimmed,
  tshirtSize: optionalTrimmed,
  phone: optionalTrimmed,
  personalEmail: optionalTrimmed.pipe(
    z.email("Invalid personal email").optional(),
  ),
  workEmail: z.string().trim().pipe(z.email("Invalid work email")),
  emergencyContact: optionalTrimmed,
  address: optionalTrimmed,
  city: optionalTrimmed,
  state: optionalTrimmed,
  pincode: optionalTrimmed,
  department: z.string().trim().min(1, "Department is required"),
  designation: z.string().trim().min(1, "Designation is required"),
  dateOfJoining: z.string().min(1, "Date of joining is required"),
  empType: z.enum(["INTERN", "PROBATION", "PERMANENT", "CONTRACT"]),
  // Internship end / confirmation due / contract end; defaults to 90 days.
  typeEndDate: optionalTrimmed.pipe(z.iso.date("Invalid date").optional()),
  isFresher: z.coerce.boolean(),
  pfNumber: optionalTrimmed,
  uanNumber: optionalTrimmed,
  linkedinId: optionalTrimmed,
  managerId: optionalTrimmed,
  // Sensitive — validated then encrypted, never stored plaintext.
  pan: optionalTrimmed.pipe(
    z
      .string()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format")
      .optional(),
  ),
  aadhaar: optionalTrimmed.pipe(
    z
      .string()
      .regex(/^\d{12}$/, "Aadhaar must be 12 digits")
      .optional(),
  ),
  bankAccount: optionalTrimmed,
  ifsc: optionalTrimmed.pipe(
    z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC format")
      .optional(),
  ),
});

const FILE_FIELDS = [
  ["photo", "photoBlobKey"],
  ["panDoc", "panBlobKey"],
  ["aadhaarDoc", "aadhaarBlobKey"],
] as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(employeeSchema.shape)) {
    const value = formData.get(key);
    if (typeof value === "string") {
      raw[key] = ["pan", "aadhaar", "ifsc", "bankAccount"].includes(key)
        ? normalizeIdentifier(value)
        : value;
    }
  }
  raw.isFresher = formData.get("isFresher") === "on" ? "true" : "";
  return employeeSchema.safeParse(raw);
}

/** Main fields plus previous companies (none for a fresher), errors merged. */
function parseEmployeeForm(formData: FormData) {
  const parsed = parseForm(formData);
  const previous =
    formData.get("isFresher") === "on"
      ? { rows: [] }
      : parsePreviousEmployments(formData);
  if (!parsed.success || previous.fieldErrors) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...previous.fieldErrors,
      } as Record<string, string[]>,
    };
  }
  return { data: parsed.data, previousRows: previous.rows };
}

async function uploadFiles(
  empId: string,
  formData: FormData,
): Promise<Partial<Record<(typeof FILE_FIELDS)[number][1], string>>> {
  const keys: Partial<Record<(typeof FILE_FIELDS)[number][1], string>> = {};
  for (const [field, column] of FILE_FIELDS) {
    const file = formData.get(field);
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`${field} exceeds the 10 MB limit`);
      }
      keys[column] = await uploadDocument(
        `employees/${empId}/${field}/${file.name}`,
        file,
      );
    }
  }
  return keys;
}

function sensitiveColumns(data: z.infer<typeof employeeSchema>) {
  return {
    panEnc: data.pan ? encryptField(data.pan) : undefined,
    panHash: data.pan ? blindIndex(data.pan) : undefined,
    aadhaarEnc: data.aadhaar ? encryptField(data.aadhaar) : undefined,
    aadhaarHash: data.aadhaar ? blindIndex(data.aadhaar) : undefined,
    bankAccountEnc: data.bankAccount
      ? encryptField(data.bankAccount)
      : undefined,
    bankAccountHash: data.bankAccount
      ? blindIndex(data.bankAccount)
      : undefined,
    ifscEnc: data.ifsc ? encryptField(data.ifsc) : undefined,
  };
}

/** YYYY-MM-DD for a parseable date (CSV imports vary); undefined if blank. */
function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error(`Invalid dateOfBirth: ${value}`);
  return date.toISOString().slice(0, 10);
}

/** Form fields that are stored encrypted (see lib/employee-pii.ts). */
function piiInput(data: z.infer<typeof employeeSchema>) {
  return {
    phone: data.phone,
    personalEmail: data.personalEmail,
    emergencyContact: data.emergencyContact,
    address: data.address,
    dateOfBirth: isoDate(data.dateOfBirth),
    pfNumber: data.pfNumber,
    uanNumber: data.uanNumber,
  };
}

/** Friendly duplicate-check before insert; unique constraints still back it. */
async function findDuplicate(
  data: z.infer<typeof employeeSchema>,
  excludeId?: string,
): Promise<string | undefined> {
  const orConditions: Prisma.EmployeeWhereInput[] = [
    { empId: data.empId },
    { workEmail: data.workEmail },
  ];
  if (data.pan) orConditions.push({ panHash: blindIndex(data.pan) });
  if (data.aadhaar)
    orConditions.push({ aadhaarHash: blindIndex(data.aadhaar) });
  if (data.bankAccount)
    orConditions.push({ bankAccountHash: blindIndex(data.bankAccount) });

  const existing = await db.employee.findFirst({
    where: {
      OR: orConditions,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: {
      empId: true,
      workEmail: true,
      panHash: true,
      aadhaarHash: true,
      bankAccountHash: true,
    },
  });
  if (!existing) return undefined;
  if (existing.empId === data.empId) return "Employee ID already exists";
  if (existing.workEmail === data.workEmail) return "Work email already exists";
  if (data.pan && existing.panHash === blindIndex(data.pan))
    return "An employee with this PAN already exists";
  if (data.aadhaar && existing.aadhaarHash === blindIndex(data.aadhaar))
    return "An employee with this Aadhaar already exists";
  return "An employee with this bank account already exists";
}

/** Field error when a time-bound type ends before the joining date. */
function typeEndError(empType: string, endDate: Date, joinDate: Date) {
  return hasTypeEnd(empType) && endDate < joinDate
    ? { fieldErrors: { typeEndDate: ["Must be on or after the joining date"] } }
    : null;
}

/** Create fields for the type's end date (probation record or column). */
function typeEndCreateData(empType: EmpTypeValue, endDate: Date) {
  return {
    empTypeEndsOn:
      empType === "INTERN" || empType === "CONTRACT" ? endDate : null,
    ...(empType === "PROBATION"
      ? { probation: { create: { dueDate: endDate } } }
      : {}),
  };
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const user = await requireRole("HR_ADMIN");

  const parsed = parseEmployeeForm(formData);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const { data, previousRows } = parsed;

  const duplicate = await findDuplicate(data);
  if (duplicate) return { error: duplicate };

  // Converting a candidate (Candidates → Convert to employee).
  const rawCandidateId = formData.get("candidateId");
  const candidateId =
    typeof rawCandidateId === "string" && /^\d+$/.test(rawCandidateId)
      ? BigInt(rawCandidateId)
      : undefined;
  if (
    candidateId !== undefined &&
    (await db.employee.findUnique({
      where: { candidateId },
      select: { id: true },
    }))
  ) {
    return {
      error: "This candidate has already been converted to an employee",
    };
  }

  const joinDate = new Date(data.dateOfJoining);
  const typeEnd = resolveTypeEnd(data.typeEndDate, joinDate);
  const typeEndInvalid = typeEndError(data.empType, typeEnd, joinDate);
  if (typeEndInvalid) return typeEndInvalid;

  let blobKeys;
  let previousEmployments;
  try {
    blobKeys = await uploadFiles(data.empId, formData);
    previousEmployments = await previousEmploymentsCreate(
      data.empId,
      previousRows ?? [],
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "File upload failed",
    };
  }

  const employee = await db.employee.create({
    data: {
      empId: data.empId,
      name: data.name,
      gender: data.gender,
      bloodGroup: data.bloodGroup,
      tshirtSize: data.tshirtSize,
      workEmail: data.workEmail.toLowerCase(),
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      department: data.department,
      designation: data.designation,
      dateOfJoining: joinDate,
      empType: data.empType,
      isFresher: data.isFresher,
      linkedinId: data.isFresher ? undefined : data.linkedinId,
      managerId: data.managerId,
      candidateId,
      ...sensitiveColumns(data),
      ...encryptPii(piiInput(data)),
      ...blobKeys,
      ...(previousEmployments.length > 0
        ? { previousEmployments: { create: previousEmployments } }
        : {}),
      // Onboarding completion auto-creates the linked lifecycle records.
      onboarding: {
        create: {
          joinDate,
          designation: data.designation,
          empType: data.empType,
        },
      },
      // First history entry: card starts at Photo Taken.
      idCard: {
        create: {
          statusChanges: {
            create: { toStatus: "PHOTO_TAKEN", changedById: user.id },
          },
        },
      },
      ...typeEndCreateData(data.empType, typeEnd),
    },
  });

  if (candidateId !== undefined) {
    // Leave a trail on the candidate (notes are shared with the website).
    try {
      const candidate = await db.candidate.findUnique({
        where: { id: candidateId },
        select: { notes: true },
      });
      if (candidate) {
        await db.candidate.update({
          where: { id: candidateId },
          data: {
            notes: appendNote(
              candidate.notes,
              `Converted to employee ${employee.empId}`,
            ),
          },
        });
      }
    } catch (error) {
      console.error("[employees] candidate note failed", error);
    }
  }

  // Every new joiner gets an Employee login; the set-password link is
  // emailed, and HR can copy a fresh one from the employee page.
  await provisionLogin({
    email: employee.workEmail,
    name: employee.name,
    role: "EMPLOYEE",
    employeeId: employee.id,
  });

  revalidatePath("/employees");
  revalidatePath("/onboarding");
  revalidatePath("/id-cards");
  revalidatePath("/users");

  // Basecamp: into All-General Stuffs (invite if new). Never blocks the save.
  const basecamp = await Promise.race<BasecampOnboardResult>([
    addEmployeeToBasecamp(employee.id).catch((error) => ({
      status: "failed" as const,
      reason: error instanceof Error ? error.message : "Basecamp request failed",
    })),
    new Promise((resolve) =>
      setTimeout(() => resolve({ status: "failed", reason: "Basecamp took too long" }), 20_000),
    ),
  ]);

  // Next: give the new joiner a standby device or order one.
  redirect(`/devices/provision/${employee.id}?new=1&basecamp=${basecamp.status}`);
}

export async function importEmployees(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireRole("HR_ADMIN");

  const parsed = await parseCsvFile(formData);
  if ("error" in parsed) return { error: parsed.error };

  // Validate every row first; per-row schema mirrors the single-create form.
  const { valid, failures } = collectRows(parsed.rows, (row, rowNumber) => {
    const raw: Record<string, string> = {};
    for (const key of Object.keys(employeeSchema.shape)) {
      const value = cell(row, key);
      if (value !== undefined) {
        raw[key] = ["pan", "aadhaar", "ifsc", "bankAccount"].includes(key)
          ? normalizeIdentifier(value)
          : value;
      }
    }
    raw.empType = cell(row, "empType") ?? "PROBATION";
    // z.coerce.boolean would turn "false" into true — parse explicitly.
    raw.isFresher = parseCsvBoolean(cell(row, "isFresher")) ? "true" : "";
    delete raw.managerId; // import links managers by empId, second pass below

    const result = employeeSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid row");
    }
    const joinDate = new Date(result.data.dateOfJoining);
    if (isNaN(joinDate.getTime())) {
      throw new Error(`Invalid dateOfJoining: ${result.data.dateOfJoining}`);
    }
    return {
      data: result.data,
      managerEmpId: cell(row, "managerEmpId"),
      rowNumber,
    };
  });

  // One query instead of a findDuplicate round-trip per row.
  const existing = await db.employee.findMany({
    select: {
      empId: true,
      workEmail: true,
      panHash: true,
      aadhaarHash: true,
      bankAccountHash: true,
    },
  });
  const seenEmpIds = new Set(existing.map((employee) => employee.empId));
  const seenEmails = new Set(existing.map((employee) => employee.workEmail));
  const seenPans = new Set(
    existing.map((employee) => employee.panHash).filter(Boolean),
  );
  const seenAadhaars = new Set(
    existing.map((employee) => employee.aadhaarHash).filter(Boolean),
  );
  const seenBanks = new Set(
    existing.map((employee) => employee.bankAccountHash).filter(Boolean),
  );

  const managerLinks: { empId: string; managerEmpId: string; row: number }[] =
    [];
  let imported = 0;

  for (const { data, managerEmpId, rowNumber } of valid) {
    const workEmail = data.workEmail.toLowerCase();
    const panHash = data.pan ? blindIndex(data.pan) : undefined;
    const aadhaarHash = data.aadhaar ? blindIndex(data.aadhaar) : undefined;
    const bankHash = data.bankAccount
      ? blindIndex(data.bankAccount)
      : undefined;

    const duplicate =
      (seenEmpIds.has(data.empId) && "Employee ID already exists") ||
      (seenEmails.has(workEmail) && "Work email already exists") ||
      (panHash && seenPans.has(panHash) && "PAN already exists") ||
      (aadhaarHash &&
        seenAadhaars.has(aadhaarHash) &&
        "Aadhaar already exists") ||
      (bankHash && seenBanks.has(bankHash) && "Bank account already exists");
    if (duplicate) {
      failures.push({ row: rowNumber, message: duplicate });
      continue;
    }

    const joinDate = new Date(data.dateOfJoining);
    const typeEnd = resolveTypeEnd(data.typeEndDate, joinDate);

    let created: { id: string; workEmail: string; name: string };
    try {
      created = await db.employee.create({
        data: {
          empId: data.empId,
          name: data.name,
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          tshirtSize: data.tshirtSize,
          workEmail,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          department: data.department,
          designation: data.designation,
          dateOfJoining: joinDate,
          empType: data.empType,
          isFresher: data.isFresher,
          ...encryptPii(piiInput(data)),
          linkedinId: data.isFresher ? undefined : data.linkedinId,
          ...sensitiveColumns(data),
          onboarding: {
            create: {
              joinDate,
              designation: data.designation,
              empType: data.empType,
            },
          },
          idCard: {
            create: {
              statusChanges: {
                create: { toStatus: "PHOTO_TAKEN", changedById: user.id },
              },
            },
          },
          ...typeEndCreateData(data.empType, typeEnd),
        },
      });
    } catch (error) {
      failures.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "Insert failed",
      });
      continue;
    }

    // Same as Add employee: each imported joiner gets an Employee login.
    await provisionLogin({
      email: created.workEmail,
      name: created.name,
      role: "EMPLOYEE",
      employeeId: created.id,
    });

    imported++;
    seenEmpIds.add(data.empId);
    seenEmails.add(workEmail);
    if (panHash) seenPans.add(panHash);
    if (aadhaarHash) seenAadhaars.add(aadhaarHash);
    if (bankHash) seenBanks.add(bankHash);
    if (managerEmpId) {
      managerLinks.push({
        empId: data.empId,
        managerEmpId,
        row: rowNumber,
      });
    }
  }

  // Second pass: managers may appear later in the file than their reports.
  if (managerLinks.length > 0) {
    const managers = await db.employee.findMany({
      where: { empId: { in: managerLinks.map((link) => link.managerEmpId) } },
      select: { id: true, empId: true },
    });
    const managerIdByEmpId = new Map(
      managers.map((manager) => [manager.empId, manager.id]),
    );
    for (const link of managerLinks) {
      const managerId = managerIdByEmpId.get(link.managerEmpId);
      if (!managerId || link.managerEmpId === link.empId) {
        failures.push({
          row: link.row,
          message: `Imported, but manager "${link.managerEmpId}" not found — set manually`,
        });
        continue;
      }
      await db.employee.update({
        where: { empId: link.empId },
        data: { managerId },
      });
    }
  }

  revalidatePath("/employees");
  revalidatePath("/onboarding");
  revalidatePath("/id-cards");
  revalidatePath("/probation");
  revalidatePath("/users");
  return importSummary(imported, parsed.rows.length, failures);
}

export async function updateEmployee(
  employeeId: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireRole("HR_ADMIN");

  const parsed = parseEmployeeForm(formData);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const { data, previousRows } = parsed;

  const duplicate = await findDuplicate(data, employeeId);
  if (duplicate) return { error: duplicate };

  // Sensitive fields: only overwrite when a new value was entered —
  // the form never round-trips decrypted values.
  const sensitive = Object.fromEntries(
    Object.entries(sensitiveColumns(data)).filter(
      ([, value]) => value !== undefined,
    ),
  );

  // End date for the type (default: 90 days from today, the day of the
  // edit). Switching into Probation opens or reopens the probation record.
  const joinDate = new Date(data.dateOfJoining);
  const today = new Date(`${istDay()}T00:00:00Z`);
  const typeEnd = resolveTypeEnd(data.typeEndDate, today);
  const typeEndInvalid = typeEndError(data.empType, typeEnd, joinDate);
  if (typeEndInvalid) return typeEndInvalid;
  const current = await db.employee.findUnique({
    where: { id: employeeId },
    select: { empType: true, probation: { select: { status: true } } },
  });
  if (!current) return { error: "Employee not found" };

  let blobKeys;
  let previous;
  try {
    blobKeys = await uploadFiles(data.empId, formData);
    previous = previousRows
      ? await previousEmploymentsSync(employeeId, data.empId, previousRows)
      : { writes: [], orphaned: [] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "File upload failed",
    };
  }

  const employeeUpdate = db.employee.update({
    where: { id: employeeId },
    data: {
      empId: data.empId,
      name: data.name,
      gender: data.gender,
      bloodGroup: data.bloodGroup,
      tshirtSize: data.tshirtSize,
      workEmail: data.workEmail.toLowerCase(),
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      department: data.department,
      designation: data.designation,
      dateOfJoining: joinDate,
      empType: data.empType,
      isFresher: data.isFresher,
      linkedinId: data.isFresher ? null : data.linkedinId,
      // Never allow an employee to manage themselves.
      managerId:
        data.managerId === employeeId ? null : (data.managerId ?? null),
      ...sensitive,
      ...encryptPii(piiInput(data)),
      ...blobKeys,
      ...typeEndUpdateData({
        empType: data.empType,
        previousType: current.empType,
        endDate: typeEnd,
        probation: current.probation,
      }),
    },
  });
  if (previous.writes.length > 0) {
    await db.$transaction([employeeUpdate, ...previous.writes]);
    // Replaced or removed letters: unreferenced once the rows are saved.
    await Promise.all(
      previous.orphaned.map((key) => deleteDocument(key).catch(() => {})),
    );
  } else {
    await employeeUpdate;
  }

  // Type changed: tell the employee, copying HR and Finance (best-effort).
  if (current.empType !== data.empType)
    await notifyTypeChange(employeeId, current.empType, data.empType);

  // The onboarding log shows joining date, designation and type; keep it
  // in step with the employee record.
  await db.onboardingRecord.updateMany({
    where: { employeeId },
    data: {
      joinDate,
      designation: data.designation,
      empType: data.empType,
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/probation");
  revalidatePath("/onboarding");
  redirect(`/employees/${employeeId}`);
}

export type BasecampAddState = { ok?: string; error?: string };

/** HR: (re)try adding an employee to All-General Stuffs on Basecamp. */
export async function addToBasecamp(
  _prev: BasecampAddState,
  formData: FormData,
): Promise<BasecampAddState> {
  await requireRole("HR_ADMIN");
  const employeeId = formData.get("employeeId");
  if (typeof employeeId !== "string") return { error: "Missing employee" };
  const { ONBOARD_MESSAGES } = await import("@/lib/basecamp-onboard");
  const result = await addEmployeeToBasecamp(employeeId);
  revalidatePath(`/employees/${employeeId}`);
  return result.status === "failed" || result.status === "skipped"
    ? { error: `${ONBOARD_MESSAGES[result.status]} ${result.reason}.` }
    : { ok: ONBOARD_MESSAGES[result.status] };
}
