// Dashboard: data for the built-in widgets (the ones with their own layout).
// Each checks the viewer's role itself; recruitment stats are loaded once
// per render however many recruitment widgets are on the dashboard.

import { db } from "@/lib/db";
import { PII_SELECT, readPii } from "@/lib/employee-pii";
import { celebrationsForMonth, ordinal, relativeDay } from "@/lib/celebrations";
import { getRecruitmentStats, type RecruitmentStats } from "@/lib/recruitment-stats";
import { BUILTIN_ROLES, type BuiltinKey } from "./catalog";
import type { Viewer } from "./sources";
import { addDays, addMonths, todayKey } from "./time";

export type CelebrationItem = {
  key: string;
  name: string;
  avatarKey: string | null;
  what: string;
  when: string;
};

export type BuiltinData =
  | { key: "recruitment-trend" | "recruitment-pipeline" | "recruitment-table"; stats: RecruitmentStats }
  | { key: "celebrations"; items: CelebrationItem[] }
  | { key: BuiltinKey; denied: true };

/** Birthdays and work anniversaries in the next 30 days (current staff, viewer's team). */
async function celebrations(viewer: Viewer, now: Date): Promise<CelebrationItem[]> {
  const employees = await db.employee.findMany({
    where: { dateOfExit: null, ...(viewer.role === "MANAGER" ? { manager: { userId: viewer.id } } : {}) },
    select: { id: true, empId: true, name: true, department: true, dateOfJoining: true, avatarBlobKey: true, ...PII_SELECT },
  });
  const people = employees.map((employee) => ({
    id: employee.id,
    empId: employee.empId,
    name: employee.name,
    department: employee.department,
    // Day and month only are shown, never the year.
    dateOfBirth: readPii(employee).dateOfBirth,
    dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
  }));
  const avatars = new Map(employees.map((employee) => [employee.id, employee.avatarBlobKey]));
  const today = todayKey(now);
  const end = addDays(today, 30);
  const months = [today, addMonths(today, 1)].map((day) => day.split("-").map(Number));
  return months
    .flatMap(([year, month]) => celebrationsForMonth(people, year, month))
    .filter((celebration) => celebration.date >= today && celebration.date < end)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((celebration) => ({
      key: celebration.key,
      name: celebration.employee.name,
      avatarKey: avatars.get(celebration.employee.id) ?? null,
      what: celebration.type === "BIRTHDAY" ? "🎂 Birthday" : `🎉 ${ordinal(celebration.years ?? 1)} work anniversary`,
      when: relativeDay(celebration.date, today),
    }));
}

/** Loads every built-in on a dashboard, sharing work between them. */
export async function loadBuiltins(keys: string[], viewer: Viewer, now = new Date()): Promise<Map<string, BuiltinData>> {
  const wanted = new Set(keys.filter((key): key is BuiltinKey => key in BUILTIN_ROLES));
  const allowed = (key: BuiltinKey) => wanted.has(key) && BUILTIN_ROLES[key].includes(viewer.role);
  const needsStats = (["recruitment-trend", "recruitment-pipeline", "recruitment-table"] as const).some(allowed);
  const [stats, people] = await Promise.all([
    needsStats ? getRecruitmentStats() : null,
    allowed("celebrations") ? celebrations(viewer, now) : null,
  ]);
  const result = new Map<string, BuiltinData>();
  for (const key of wanted) {
    if (!allowed(key)) result.set(key, { key, denied: true });
    else if (key === "celebrations") result.set(key, { key, items: people ?? [] });
    else result.set(key, { key, stats: stats! });
  }
  return result;
}
