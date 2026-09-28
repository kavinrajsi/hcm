// Birthdays and work anniversaries for a month. Pure date logic (tested);
// the page supplies employees with a decrypted date of birth.
//
// Privacy: birthdays show day and month only — never the year or age.

export type CelebrationType = "BIRTHDAY" | "ANNIVERSARY";

export type Celebrant = {
  id: string;
  empId: string;
  name: string;
  department: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  dateOfJoining: string; // YYYY-MM-DD
};

export type Celebration = {
  key: string;
  type: CelebrationType;
  date: string; // YYYY-MM-DD in the viewed month
  day: number;
  employee: Pick<Celebrant, "id" | "empId" | "name" | "department">;
  years?: number; // anniversaries: completed years
};

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The day a yearly date (from YYYY-MM-DD) falls on in `year`/`month` (1-12),
 * or null if it isn't in that month. 29 Feb moves to 28 Feb in other years.
 */
export function dayInMonth(
  iso: string,
  year: number,
  month: number,
): number | null {
  const [, isoMonth, isoDay] = iso.slice(0, 10).split("-").map(Number);
  if (isoMonth !== month) return null;
  if (isoMonth === 2 && isoDay === 29 && !isLeap(year)) return 28;
  return isoDay;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Every birthday and anniversary (1+ years) in `year`/`month`, by day. */
export function celebrationsForMonth(
  people: Celebrant[],
  year: number,
  month: number,
): Celebration[] {
  const out: Celebration[] = [];
  for (const person of people) {
    const employee = {
      id: person.id,
      empId: person.empId,
      name: person.name,
      department: person.department,
    };
    if (person.dateOfBirth) {
      const day = dayInMonth(person.dateOfBirth, year, month);
      if (day !== null) {
        out.push({
          key: `b-${person.id}`,
          type: "BIRTHDAY",
          date: `${year}-${pad(month)}-${pad(day)}`,
          day,
          employee,
        });
      }
    }
    const joinYear = Number(person.dateOfJoining.slice(0, 4));
    const years = year - joinYear;
    if (years >= 1) {
      const day = dayInMonth(person.dateOfJoining, year, month);
      if (day !== null) {
        out.push({
          key: `a-${person.id}`,
          type: "ANNIVERSARY",
          date: `${year}-${pad(month)}-${pad(day)}`,
          day,
          employee,
          years,
        });
      }
    }
  }
  return out.sort(
    (left, right) =>
      left.day - right.day ||
      left.type.localeCompare(right.type) ||
      left.employee.name.localeCompare(right.employee.name),
  );
}

/** "Today", "Tomorrow", "in 5 days", or "3 days ago" relative to `today`. */
export function relativeDay(date: string, today: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

export const ordinal = (value: number) => {
  const suffixes = ["th", "st", "nd", "rd"];
  const lastTwoDigits = value % 100;
  return `${value}${suffixes[(lastTwoDigits - 20) % 10] ?? suffixes[lastTwoDigits] ?? suffixes[0]}`;
};
