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

/** "h:mm am" for a timestamp, in Asia/Kolkata. */
export function formatTime(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  return formatDateTime(value).split(", ")[1] ?? "";
}

/** "YYYY-MM-DD" of a timestamp's calendar day in Asia/Kolkata. */
export function istDayKey(value: Date): string {
  return new Date(value.getTime() + IST_MS).toISOString().slice(0, 10);
}

/**
 * A `datetime-local` value ("2026-10-05T18:00") read as Asia/Kolkata time.
 * `new Date()` would read it in the server's zone (UTC on Vercel) and land
 * 5½ hours late. Null when unparseable.
 */
export function parseIstLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Reject rollovers such as 31 February or 25:00.
  if (wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day || hour > 23 || minute > 59)
    return null;
  return new Date(wall.getTime() - IST_MS);
}

/** The inverse of parseIstLocal, for a `datetime-local` input's default. */
export function toIstLocalInput(value: Date): string {
  return new Date(value.getTime() + IST_MS).toISOString().slice(0, 16);
}

/** The instant an Asia/Kolkata calendar day ("YYYY-MM-DD") starts. */
export function istDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+05:30`);
}
