import { z } from "zod";

// Rules for an employee's skills. A skill is a name plus a level from 1
// (beginner) to 5 (expert). Names are unique per employee, ignoring case;
// the database enforces that, the action reports it.

export const SKILL_LEVELS = [1, 2, 3, 4, 5] as const;
export const SKILL_NAME_MAX = 60;

export const SKILL_LEVEL_LABELS: Record<(typeof SKILL_LEVELS)[number], string> = {
  1: "1 · Beginner",
  2: "2 · Basic",
  3: "3 · Working",
  4: "4 · Strong",
  5: "5 · Expert",
};

export const skillSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Skill is required")
    .max(SKILL_NAME_MAX, `Skill is too long (${SKILL_NAME_MAX} characters at most)`)
    .refine((value) => /\p{L}/u.test(value), "Skill must contain letters")
    .transform((value) => value.replace(/\s+/g, " ")),
  level: z
    .string()
    .regex(/^[1-5]$/, "Pick a level from 1 to 5")
    .transform(Number),
});

/** The list order: strongest first, then A to Z. */
export function sortSkills<T extends { name: string; level: number }>(skills: T[]): T[] {
  return [...skills].sort(
    (left, right) => right.level - left.level || left.name.localeCompare(right.name),
  );
}
