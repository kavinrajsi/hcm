"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { blindIndex, encryptField, normalizeIdentifier } from "@/lib/crypto";
import { uploadDocument } from "@/lib/blob";
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
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const employeeSchema = z.object({
  empId: z.string().trim().min(1, "Employee ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: optionalTrimmed,
  bloodGroup: optionalTrimmed,
  tshirtSize: optionalTrimmed,
  phone: z.string().trim().min(7, "Phone is required"),
  personalEmail: z.string().trim().pipe(z.email("Invalid personal email")),
  workEmail: z.string().trim().pipe(z.email("Invalid work email")),
  emergencyContact: optionalTrimmed,
  address: optionalTrimmed,
  city: optionalTrimmed,
  state: optionalTrimmed,
  pincode: optionalTrimmed,
  department: z.string().trim().min(1, "Department is required"),
  designation: z.string().trim().min(1, "Designation is required"),
  dateOfJoining: z.string().min(1, "Date of joining is required"),
  empType: z.enum(["INTERN", "PROBATION", "PERMANENT"]),
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
  ["offerLetter", "offerLetterBlobKey"],
  ["experienceLetter", "experienceLetterBlobKey"],
  ["relievingLetter", "relievingLetterBlobKey"],
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
    ifscEnc: data.ifsc ? encryptField(data.ifsc) : undefined,
  };
}

/** Friendly duplicate-check before insert; unique constraints still back it. */
async function findDuplicate(
  data: z.infer<typeof employeeSchema>,
  excludeId?: string,
): Promise<string | undefined> {
  const or: Prisma.EmployeeWhereInput[] = [
    { empId: data.empId },
    { workEmail: data.workEmail },
  ];
  if (data.pan) or.push({ panHash: blindIndex(data.pan) });
  if (data.aadhaar) or.push({ aadhaarHash: blindIndex(data.aadhaar) });

  const existing = await db.employee.findFirst({
    where: { OR: or, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { empId: true, workEmail: true, panHash: true, aadhaarHash: true },
  });
  if (!existing) return undefined;
  if (existing.empId === data.empId) return "Employee ID already exists";
  if (existing.workEmail === data.workEmail)
    return "Work email already exists";
  if (data.pan && existing.panHash === blindIndex(data.pan))
    return "An employee with this PAN already exists";
  return "An employee with this Aadhaar already exists";
}

// Default probation length; HR can extend from the probation module.
const PROBATION_MONTHS = 6;

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireRole("HR_ADMIN");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const data = parsed.data;

  const duplicate = await findDuplicate(data);
  if (duplicate) return { error: duplicate };

  let blobKeys;
  try {
    blobKeys = await uploadFiles(data.empId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "File upload failed" };
  }

  const joinDate = new Date(data.dateOfJoining);
  const probationDue = new Date(joinDate);
  probationDue.setUTCMonth(probationDue.getUTCMonth() + PROBATION_MONTHS);

  const employee = await db.employee.create({
    data: {
      empId: data.empId,
      name: data.name,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      bloodGroup: data.bloodGroup,
      tshirtSize: data.tshirtSize,
      phone: data.phone,
      personalEmail: data.personalEmail,
      workEmail: data.workEmail.toLowerCase(),
      emergencyContact: data.emergencyContact,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      department: data.department,
      designation: data.designation,
      dateOfJoining: joinDate,
      empType: data.empType,
      isFresher: data.isFresher,
      pfNumber: data.pfNumber,
      uanNumber: data.uanNumber,
      linkedinId: data.isFresher ? undefined : data.linkedinId,
      managerId: data.managerId,
      ...sensitiveColumns(data),
      ...blobKeys,
      // Onboarding completion auto-creates the linked lifecycle records.
      onboarding: {
        create: {
          joinDate,
          designation: data.designation,
          empType: data.empType,
        },
      },
      idCard: { create: {} },
      ...(data.empType === "PROBATION"
        ? { probation: { create: { dueDate: probationDue } } }
        : {}),
    },
  });

  revalidatePath("/employees");
  revalidatePath("/onboarding");
  revalidatePath("/id-cards");
  redirect(`/employees/${employee.id}`);
}

export async function importEmployees(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("HR_ADMIN");

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
    select: { empId: true, workEmail: true, panHash: true, aadhaarHash: true },
  });
  const seenEmpIds = new Set(existing.map((e) => e.empId));
  const seenEmails = new Set(existing.map((e) => e.workEmail));
  const seenPans = new Set(existing.map((e) => e.panHash).filter(Boolean));
  const seenAadhaars = new Set(
    existing.map((e) => e.aadhaarHash).filter(Boolean),
  );

  const managerLinks: { empId: string; managerEmpId: string; row: number }[] =
    [];
  let imported = 0;

  for (const { data, managerEmpId, rowNumber } of valid) {
    const workEmail = data.workEmail.toLowerCase();
    const panHash = data.pan ? blindIndex(data.pan) : undefined;
    const aadhaarHash = data.aadhaar ? blindIndex(data.aadhaar) : undefined;

    const duplicate =
      (seenEmpIds.has(data.empId) && "Employee ID already exists") ||
      (seenEmails.has(workEmail) && "Work email already exists") ||
      (panHash && seenPans.has(panHash) && "PAN already exists") ||
      (aadhaarHash &&
        seenAadhaars.has(aadhaarHash) &&
        "Aadhaar already exists");
    if (duplicate) {
      failures.push({ row: rowNumber, message: duplicate });
      continue;
    }

    const joinDate = new Date(data.dateOfJoining);
    const probationDue = new Date(joinDate);
    probationDue.setUTCMonth(probationDue.getUTCMonth() + PROBATION_MONTHS);

    try {
      await db.employee.create({
        data: {
          empId: data.empId,
          name: data.name,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth
            ? new Date(data.dateOfBirth)
            : undefined,
          bloodGroup: data.bloodGroup,
          tshirtSize: data.tshirtSize,
          phone: data.phone,
          personalEmail: data.personalEmail,
          workEmail,
          emergencyContact: data.emergencyContact,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          department: data.department,
          designation: data.designation,
          dateOfJoining: joinDate,
          empType: data.empType,
          isFresher: data.isFresher,
          pfNumber: data.pfNumber,
          uanNumber: data.uanNumber,
          linkedinId: data.isFresher ? undefined : data.linkedinId,
          ...sensitiveColumns(data),
          onboarding: {
            create: {
              joinDate,
              designation: data.designation,
              empType: data.empType,
            },
          },
          idCard: { create: {} },
          ...(data.empType === "PROBATION"
            ? { probation: { create: { dueDate: probationDue } } }
            : {}),
        },
      });
    } catch (e) {
      failures.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : "Insert failed",
      });
      continue;
    }

    imported++;
    seenEmpIds.add(data.empId);
    seenEmails.add(workEmail);
    if (panHash) seenPans.add(panHash);
    if (aadhaarHash) seenAadhaars.add(aadhaarHash);
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
      where: { empId: { in: managerLinks.map((l) => l.managerEmpId) } },
      select: { id: true, empId: true },
    });
    const managerIdByEmpId = new Map(managers.map((m) => [m.empId, m.id]));
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
  return importSummary(imported, parsed.rows.length, failures);
}

export async function updateEmployee(
  employeeId: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireRole("HR_ADMIN");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const data = parsed.data;

  const duplicate = await findDuplicate(data, employeeId);
  if (duplicate) return { error: duplicate };

  let blobKeys;
  try {
    blobKeys = await uploadFiles(data.empId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "File upload failed" };
  }

  // Sensitive fields: only overwrite when a new value was entered —
  // the form never round-trips decrypted values.
  const sensitive = Object.fromEntries(
    Object.entries(sensitiveColumns(data)).filter(([, v]) => v !== undefined),
  );

  await db.employee.update({
    where: { id: employeeId },
    data: {
      empId: data.empId,
      name: data.name,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      bloodGroup: data.bloodGroup,
      tshirtSize: data.tshirtSize,
      phone: data.phone,
      personalEmail: data.personalEmail,
      workEmail: data.workEmail.toLowerCase(),
      emergencyContact: data.emergencyContact,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      department: data.department,
      designation: data.designation,
      dateOfJoining: new Date(data.dateOfJoining),
      empType: data.empType,
      isFresher: data.isFresher,
      pfNumber: data.pfNumber,
      uanNumber: data.uanNumber,
      linkedinId: data.isFresher ? null : data.linkedinId,
      // Never allow an employee to manage themselves.
      managerId: data.managerId === employeeId ? null : (data.managerId ?? null),
      ...sensitive,
      ...blobKeys,
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}`);
}
