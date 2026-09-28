import { beforeEach, describe, expect, it, vi } from "vitest";

// MadMax tool scoping: which tools each role gets, and that executes refuse
// anything outside the signed-in user's scope whatever the model asks for.

const db = vi.hoisted(() => ({
  employee: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
  leaveEntry: { findUnique: vi.fn(), update: vi.fn() },
  quantumEntry: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { WRITE_TOOLS, buildTools, employeeScope, toolNamesFor } =
  await import("./tools");
const { MADMAX_MODELS, modelByKey } = await import("./models");

type Role = "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
const context = (role: Role, employeeId: string | null = "emp-self") => ({
  user: { id: `user-${role}`, role, email: "a@madarth.com" },
  employeeId,
  displayName: "Asha",
});
// Tools' execute takes (input, options); options aren't used here.
type Executable = { execute: (input: unknown, options: unknown) => unknown };
const run = (tools: Record<string, unknown>, name: string, input: unknown) =>
  (tools[name] as Executable).execute(input, {
    toolCallId: "call-1",
    messages: [],
  });

beforeEach(() => vi.clearAllMocks());

describe("tool sets per role", () => {
  it("gives employees only their own tools", () => {
    const names = Object.keys(buildTools(context("EMPLOYEE")));
    expect(names).toEqual(toolNamesFor("EMPLOYEE"));
    expect(names).not.toContain("getEmployee");
    expect(names).not.toContain("searchCandidates");
  });

  it("adds team tools for managers, org tools for HR", () => {
    const manager = Object.keys(buildTools(context("MANAGER")));
    expect(manager).toContain("reviewLeave");
    expect(manager).not.toContain("setCandidateStatus");
    const hr = Object.keys(buildTools(context("HR_ADMIN")));
    expect(hr).toEqual(expect.arrayContaining([...WRITE_TOOLS]));
  });

  it("scopes employees by role", () => {
    expect(employeeScope(context("HR_ADMIN"))).toEqual({});
    expect(employeeScope(context("MANAGER"))).toEqual({
      manager: { userId: "user-MANAGER" },
    });
    expect(employeeScope(context("EMPLOYEE"))).toEqual({ id: "emp-self" });
    expect(employeeScope(context("EMPLOYEE", null))).toEqual({
      id: "__none__",
    });
  });
});

describe("scope checks in execute", () => {
  it("won't let a manager review leave outside their team", async () => {
    db.leaveEntry.findUnique.mockResolvedValue({ employeeId: "emp-other" });
    db.employee.findFirst.mockResolvedValue(null);
    const tools = buildTools(context("MANAGER"));
    await expect(
      run(tools, "reviewLeave", { entryId: "leave-1", decision: "APPROVED" }),
    ).rejects.toThrow("isn't in your scope");
    expect(db.leaveEntry.update).not.toHaveBeenCalled();
    // The scope query is the manager's own team.
    expect(db.employee.findFirst.mock.calls[0][0].where.AND).toContainEqual({
      manager: { userId: "user-MANAGER" },
    });
  });

  it("reviews leave for a report", async () => {
    db.leaveEntry.findUnique.mockResolvedValue({ employeeId: "emp-report" });
    db.employee.findFirst.mockResolvedValue({ id: "emp-report" });
    const tools = buildTools(context("MANAGER"));
    await run(tools, "reviewLeave", {
      entryId: "leave-1",
      decision: "APPROVED",
    });
    expect(db.leaveEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "leave-1" } }),
    );
  });

  it("always logs Quantum work for the signed-in user", async () => {
    db.quantumEntry.create.mockResolvedValue({ id: "q1" });
    const tools = buildTools(context("EMPLOYEE"));
    await run(tools, "addMyQuantumEntry", {
      date: "2026-09-28",
      brand: "Madarth",
      workName: "Website",
      durationMins: 120,
    });
    expect(db.quantumEntry.create.mock.calls[0][0].data.employeeId).toBe(
      "emp-self",
    );
  });

  it("refuses personal tools without a linked employee", async () => {
    const tools = buildTools(context("EMPLOYEE", null));
    await expect(run(tools, "listMyQuantumEntries", {})).rejects.toThrow(
      "No employee record",
    );
  });
});

describe("models", () => {
  it("only allows listed models", () => {
    expect(modelByKey("sonnet")?.id).toBe("anthropic/claude-sonnet-5");
    expect(modelByKey("openai/gpt-5")).toBeNull();
    expect(modelByKey(undefined)).toBeNull();
    expect(MADMAX_MODELS.every((model) => model.id.includes("/"))).toBe(true);
  });
});
