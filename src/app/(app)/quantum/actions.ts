"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireSelfOrRole } from "@/lib/rbac";
import { getAccessToken, listProjects, listProjectTodos } from "@/lib/basecamp";
import {
  cell,
  collectRows,
  importSummary,
  parseCsvDate,
  parseCsvFile,
  type ImportState,
} from "@/lib/csv-import";

const entrySchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  brand: z.string().trim().min(1, "Brand is required"),
  workName: z.string().trim().min(1, "Work name is required"),
  link: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  durationMins: z.coerce.number().int().min(0),
});

export type QuantumFormState = { error?: string; ok?: boolean };

export async function addQuantumEntry(
  _prev: QuantumFormState,
  formData: FormData,
): Promise<QuantumFormState> {
  const parsed = entrySchema.safeParse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    brand: formData.get("brand"),
    workName: formData.get("workName"),
    link: formData.get("link") ?? undefined,
    durationMins: formData.get("durationMins"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  }

  // Employees may log their own work; HR can log for anyone.
  await requireSelfOrRole(parsed.data.employeeId, "HR_ADMIN");

  await db.quantumEntry.create({
    data: {
      employeeId: parsed.data.employeeId,
      date: new Date(parsed.data.date),
      brand: parsed.data.brand,
      workName: parsed.data.workName,
      link: parsed.data.link,
      durationMins: parsed.data.durationMins,
    },
  });

  revalidatePath("/quantum");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteQuantumEntry(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");
  const entry = await db.quantumEntry.findUnique({
    where: { id },
    select: { employeeId: true },
  });
  if (!entry) return;
  await requireSelfOrRole(entry.employeeId, "HR_ADMIN");

  await db.quantumEntry.delete({ where: { id } });
  revalidatePath("/quantum");
  revalidatePath("/me");
}

export async function importQuantumEntries(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("HR_ADMIN");

  const parsed = await parseCsvFile(formData);
  if ("error" in parsed) return { error: parsed.error };

  const employees = await db.employee.findMany({
    where: { empId: { in: parsed.rows.map((r) => r.empId).filter(Boolean) } },
    select: { id: true, empId: true },
  });
  const idByEmpId = new Map(employees.map((e) => [e.empId, e.id]));

  const { valid, failures } = collectRows(parsed.rows, (row) => {
    const employeeId = idByEmpId.get(row.empId ?? "");
    if (!employeeId) throw new Error(`Unknown empId: ${row.empId || "(empty)"}`);
    const result = entrySchema.safeParse({
      employeeId,
      date: row.date,
      brand: row.brand,
      workName: row.workName,
      link: cell(row, "link"),
      durationMins: cell(row, "durationMins") ?? "0",
    });
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid row");
    }
    return { ...result.data, date: parseCsvDate(result.data.date, "date") };
  });

  await db.quantumEntry.createMany({ data: valid });
  revalidatePath("/quantum");
  revalidatePath("/me");
  return importSummary(valid.length, parsed.rows.length, failures);
}

/**
 * Imports todos from a Basecamp project as Quantum entries for one
 * employee. Brand = project name, work = todo title, duration entered
 * manually afterwards. Dedupe by basecampId.
 */
export async function importFromBasecamp(
  _prev: QuantumFormState,
  formData: FormData,
): Promise<QuantumFormState> {
  const user = await requireRole("HR_ADMIN");

  const employeeId = formData.get("employeeId");
  const projectId = formData.get("projectId");
  if (typeof employeeId !== "string" || !employeeId)
    return { error: "Pick an employee to import for" };
  if (typeof projectId !== "string" || !projectId)
    return { error: "Pick a Basecamp project" };

  const auth = await getAccessToken(user.id);
  if (!auth) return { error: "Basecamp not connected — connect it first" };

  const projects = await listProjects(auth.accessToken, auth.accountId);
  const project = projects.find((p) => String(p.id) === projectId);
  if (!project) return { error: "Project not found" };

  const todos = await listProjectTodos(
    auth.accessToken,
    auth.accountId,
    project,
  );

  for (const todo of todos) {
    await db.quantumEntry.upsert({
      where: {
        employeeId_basecampId: {
          employeeId,
          basecampId: String(todo.id),
        },
      },
      update: {}, // already imported — leave manual edits alone
      create: {
        employeeId,
        date: new Date(todo.updated_at),
        brand: project.name,
        workName: todo.title,
        link: todo.app_url,
        durationMins: 0,
        source: "BASECAMP",
        basecampId: String(todo.id),
      },
    });
  }

  revalidatePath("/quantum");
  return { ok: true, error: undefined };
}
