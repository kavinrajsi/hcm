import Papa from "papaparse";
import { parseIstLocal } from "@/lib/format-date";

export type ImportFailure = { row: number; message: string };

export type ImportState = {
  error?: string;
  ok?: string;
  failures?: ImportFailure[];
};

export type CsvRow = Record<string, string>;

const MAX_CSV_BYTES = 5 * 1024 * 1024;

/**
 * Reads the "file" field from a form submission and parses it as a
 * header-row CSV. Row numbers reported to users are 1-based including
 * the header, so the first data row is row 2.
 */
export async function parseCsvFile(
  formData: FormData,
): Promise<{ rows: CsvRow[] } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload" };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { error: "CSV exceeds the 5 MB limit" };
  }

  const result = Papa.parse<CsvRow>(await file.text(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    const where = first.row !== undefined ? ` on row ${first.row + 2}` : "";
    return { error: `CSV parse error${where}: ${first.message}` };
  }
  if (result.data.length === 0) {
    return { error: "CSV has no data rows" };
  }
  return { rows: result.data };
}

/**
 * Validates every row up front (validate throws with a user-facing
 * message); invalid rows become failures, valid ones are returned for
 * a batch insert.
 */
export function collectRows<T>(
  rows: CsvRow[],
  validate: (row: CsvRow, rowNumber: number) => T,
): { valid: T[]; failures: ImportFailure[] } {
  const valid: T[] = [];
  const failures: ImportFailure[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    try {
      valid.push(validate(row, rowNumber));
    } catch (error) {
      failures.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "Invalid row",
      });
    }
  });
  return { valid, failures };
}

export function importSummary(
  imported: number,
  total: number,
  failures: ImportFailure[],
): ImportState {
  return {
    ok: `Imported ${imported} of ${total} rows`,
    failures: failures.length > 0 ? failures : undefined,
  };
}

/** Empty CSV cells come through as "" — treat them as absent. */
export function cell(row: CsvRow, key: string): string | undefined {
  const value = row[key];
  return value === undefined || value === "" ? undefined : value;
}

export function parseCsvDate(value: string | undefined, label: string): Date {
  if (!value) throw new Error(`${label} is required`);
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return date;
}

/**
 * A CSV date-time in Indian time: "2026-10-05 18:00" (or with T), or a
 * bare date (midnight IST). A value with an explicit zone (Z, +05:30) is
 * taken as given. Plain `new Date()` would read local times in the
 * server's zone (UTC on Vercel), 5½ hours off.
 */
export function parseCsvIstDateTime(value: string | undefined, label: string): Date {
  if (!value) throw new Error(`${label} is required`);
  const trimmed = value.trim();
  const local = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?(?::\d{2})?$/.exec(trimmed);
  if (!local) return parseCsvDate(trimmed, label);
  const date = parseIstLocal(`${local[1]}T${local[2] ?? "00:00"}`);
  if (!date) throw new Error(`Invalid ${label}: ${value}`);
  return date;
}

/** CSV booleans: "true"/"yes"/"1" (any case) are true, anything else false. */
export function parseCsvBoolean(value: string | undefined): boolean {
  return ["true", "yes", "1"].includes((value ?? "").toLowerCase());
}
