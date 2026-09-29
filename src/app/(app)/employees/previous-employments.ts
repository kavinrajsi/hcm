import { db } from "@/lib/db";
import { uploadDocument } from "@/lib/blob";
import { PREVIOUS_EMPLOYMENT_DOCUMENTS } from "@/lib/employee-documents";
import type { Prisma } from "@/generated/prisma/client";

// Experienced hires' previous companies, posted by the employee form as
// indexed fields: prevCount, prev.{i}.id, prev.{i}.companyName and the
// letter files prev.{i}.offerLetter / experienceLetter / relievingLetter.

export const MAX_PREVIOUS_COMPANIES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type LetterColumn = (typeof PREVIOUS_EMPLOYMENT_DOCUMENTS)[number][0];
type LetterField = (typeof PREVIOUS_EMPLOYMENT_DOCUMENTS)[number][1];

export type PreviousEmploymentInput = {
  id?: string;
  companyName: string;
  files: Partial<Record<LetterField, File>>;
};

export type ParsedPreviousEmployments = {
  /** undefined: the form didn't send the section — leave rows as they are. */
  rows?: PreviousEmploymentInput[];
  fieldErrors?: Record<string, string[]>;
};

export function parsePreviousEmployments(
  formData: FormData,
): ParsedPreviousEmployments {
  const rawCount = formData.get("prevCount");
  if (typeof rawCount !== "string") return {};
  const count = Number.parseInt(rawCount, 10);
  if (!Number.isInteger(count) || count < 0) return { rows: [] };
  if (count > MAX_PREVIOUS_COMPANIES) {
    return {
      fieldErrors: {
        previousEmployments: [
          `At most ${MAX_PREVIOUS_COMPANIES} previous companies`,
        ],
      },
    };
  }

  const rows: PreviousEmploymentInput[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (let index = 0; index < count; index++) {
    const prefix = `prev.${index}`;
    const rawId = formData.get(`${prefix}.id`);
    const id = typeof rawId === "string" && rawId.trim() ? rawId.trim() : "";
    const rawName = formData.get(`${prefix}.companyName`);
    const companyName = typeof rawName === "string" ? rawName.trim() : "";

    const files: PreviousEmploymentInput["files"] = {};
    for (const [, field] of PREVIOUS_EMPLOYMENT_DOCUMENTS) {
      const file = formData.get(`${prefix}.${field}`);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        fieldErrors[`${prefix}.${field}`] = ["Exceeds the 10 MB limit"];
      }
      files[field] = file;
    }

    // An untouched empty row (e.g. "+ Add company" then nothing) is dropped.
    if (!id && !companyName && Object.keys(files).length === 0) continue;
    if (!companyName) {
      fieldErrors[`${prefix}.companyName`] = ["Company name is required"];
    } else if (companyName.length > 200) {
      fieldErrors[`${prefix}.companyName`] = ["At most 200 characters"];
    }
    rows.push({ ...(id ? { id } : {}), companyName, files });
  }

  return Object.keys(fieldErrors).length > 0 ? { fieldErrors } : { rows };
}

/** Uploads each row's new letters; blob keys by row, in row order. */
export async function uploadPreviousEmploymentFiles(
  empId: string,
  rows: PreviousEmploymentInput[],
): Promise<Partial<Record<LetterColumn, string>>[]> {
  const keys: Partial<Record<LetterColumn, string>>[] = [];
  for (const row of rows) {
    const rowKeys: Partial<Record<LetterColumn, string>> = {};
    for (const [column, field] of PREVIOUS_EMPLOYMENT_DOCUMENTS) {
      const file = row.files[field];
      if (file) {
        rowKeys[column] = await uploadDocument(
          `employees/${empId}/previous/${field}/${file.name}`,
          file,
        );
      }
    }
    keys.push(rowKeys);
  }
  return keys;
}

/** Nested create data for a new employee's previous companies. */
export async function previousEmploymentsCreate(
  empId: string,
  rows: PreviousEmploymentInput[],
) {
  const keys = await uploadPreviousEmploymentFiles(empId, rows);
  return rows.map((row, position) => ({
    companyName: row.companyName,
    position,
    ...keys[position],
  }));
}

/**
 * Writes that bring an employee's saved companies in line with the form
 * (uploads happen here, before anything is written), plus the blob keys
 * that become unreferenced once those writes commit. Row ids from the form
 * only count when they belong to this employee; others become new rows.
 */
export async function previousEmploymentsSync(
  employeeId: string,
  empId: string,
  rows: PreviousEmploymentInput[],
) {
  const existing = await db.previousEmployment.findMany({
    where: { employeeId },
  });
  const keys = await uploadPreviousEmploymentFiles(empId, rows);

  const byId = new Map(existing.map((row) => [row.id, row]));
  const kept = new Set<string>();
  const orphaned: string[] = [];
  const writes: Prisma.PrismaPromise<unknown>[] = rows.map((row, position) => {
    const current = row.id ? byId.get(row.id) : undefined;
    const data = { companyName: row.companyName, position, ...keys[position] };
    if (current && !kept.has(current.id)) {
      kept.add(current.id);
      for (const [column] of PREVIOUS_EMPLOYMENT_DOCUMENTS) {
        const replaced = current[column];
        if (keys[position][column] && replaced) orphaned.push(replaced);
      }
      return db.previousEmployment.update({ where: { id: current.id }, data });
    }
    return db.previousEmployment.create({ data: { employeeId, ...data } });
  });

  const removed = existing.filter((row) => !kept.has(row.id));
  for (const row of removed) {
    for (const [column] of PREVIOUS_EMPLOYMENT_DOCUMENTS) {
      const key = row[column];
      if (key) orphaned.push(key);
    }
  }
  if (removed.length > 0) {
    writes.unshift(
      db.previousEmployment.deleteMany({
        where: { employeeId, id: { in: removed.map((row) => row.id) } },
      }),
    );
  }
  return { writes, orphaned };
}
