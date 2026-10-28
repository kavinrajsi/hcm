import { describe, expect, it } from "vitest";
import { skillSchema, sortSkills } from "./skill-rules";

describe("skillSchema", () => {
  it("accepts a skill and a level from 1 to 5", () => {
    const result = skillSchema.safeParse({ name: "  Figma   design ", level: "4" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: "Figma design", level: 4 });
  });

  it("refuses a level outside 1 to 5", () => {
    for (const level of ["0", "6", "", "3.5", "high"]) {
      const result = skillSchema.safeParse({ name: "Figma", level });
      expect(result.success, level).toBe(false);
    }
  });

  it("needs a skill name with letters, up to 60 characters", () => {
    expect(skillSchema.safeParse({ name: "", level: "3" }).success).toBe(false);
    expect(skillSchema.safeParse({ name: "123", level: "3" }).success).toBe(false);
    expect(skillSchema.safeParse({ name: "a".repeat(61), level: "3" }).success).toBe(false);
    expect(skillSchema.safeParse({ name: "a".repeat(60), level: "3" }).success).toBe(true);
  });
});

describe("sortSkills", () => {
  it("lists the strongest first, then A to Z", () => {
    const sorted = sortSkills([
      { name: "Writing", level: 3 },
      { name: "Figma", level: 5 },
      { name: "Excel", level: 3 },
    ]);
    expect(sorted.map((skill) => skill.name)).toEqual(["Figma", "Excel", "Writing"]);
  });
});
