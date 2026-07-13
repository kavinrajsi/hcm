import Papa from "papaparse";

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
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
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
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    try {
      valid.push(validate(row, rowNumber));
    } catch (e) {
      failures.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : "Invalid row",
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

/** CSV booleans: "true"/"yes"/"1" (any case) are true, anything else false. */
export function parseCsvBoolean(value: string | undefined): boolean {
  return ["true", "yes", "1"].includes((value ?? "").toLowerCase());
}
