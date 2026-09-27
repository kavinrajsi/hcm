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

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The day a yearly date (from YYYY-MM-DD) falls on in `year`/`month` (1-12),
 * or null if it isn't in that month. 29 Feb moves to 28 Feb in other years.
 */
export function dayInMonth(
  iso: string,
  year: number,
  month: number,
): number | null {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (m !== month) return null;
  if (m === 2 && d === 29 && !isLeap(year)) return 28;
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Every birthday and anniversary (1+ years) in `year`/`month`, by day. */
export function celebrationsForMonth(
  people: Celebrant[],
  year: number,
  month: number,
): Celebration[] {
  const out: Celebration[] = [];
  for (const p of people) {
    const employee = {
      id: p.id,
      empId: p.empId,
      name: p.name,
      department: p.department,
    };
    if (p.dateOfBirth) {
      const day = dayInMonth(p.dateOfBirth, year, month);
      if (day !== null) {
        out.push({
          key: `b-${p.id}`,
          type: "BIRTHDAY",
          date: `${year}-${pad(month)}-${pad(day)}`,
          day,
          employee,
        });
      }
    }
    const joinYear = Number(p.dateOfJoining.slice(0, 4));
    const years = year - joinYear;
    if (years >= 1) {
      const day = dayInMonth(p.dateOfJoining, year, month);
      if (day !== null) {
        out.push({
          key: `a-${p.id}`,
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
    (a, b) =>
      a.day - b.day ||
      a.type.localeCompare(b.type) ||
      a.employee.name.localeCompare(b.employee.name),
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

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
