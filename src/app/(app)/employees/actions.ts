"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { blindIndex, encryptField, normalizeIdentifier } from "@/lib/crypto";
import { uploadDocument } from "@/lib/blob";
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
