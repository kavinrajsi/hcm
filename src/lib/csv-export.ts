// Builds CSV text for downloads. Cells that start with a formula character
// get a leading apostrophe so Excel and Sheets show them as text.
import Papa from "papaparse";

const FORMULA_START = /^[=+\-@\t\r]/;

function safeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function toCsv(
  columns: readonly string[],
  rows: Record<string, string>[],
): string {
  return Papa.unparse(
    {
      fields: [...columns],
      data: rows.map((row) => columns.map((column) => safeCell(row[column] ?? ""))),
    },
    { newline: "\r\n" },
  );
}
