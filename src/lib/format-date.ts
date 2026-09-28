// Indian date display (DD/MM/YYYY) for everything the app shows. Values
// that are posted, compared or sorted stay ISO (YYYY-MM-DD); format only at
// the point of display.

const IST_MS = 330 * 60_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * DD/MM/YYYY for a calendar date: a @db.Date value (stored as UTC midnight)
 * or a "YYYY-MM-DD" string. Empty for missing or unparseable input.
 */
export function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  const iso =
    typeof value === "string"
      ? value
      : Number.isNaN(value.getTime())
        ? ""
        : value.toISOString();
  const match = ISO_DAY.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** DD/MM/YYYY of a timestamp's calendar day in Asia/Kolkata. */
export function formatInstantDay(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  return formatDay(new Date(value.getTime() + IST_MS));
}

/** "DD/MM/YYYY, h:mm am" for a timestamp, in Asia/Kolkata. */
export function formatDateTime(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const shifted = new Date(value.getTime() + IST_MS);
  const hours = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${formatDay(shifted)}, ${hour12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
}
