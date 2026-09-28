import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// updateEmployee against a mocked database: saving keeps the onboarding log
// in step with the employee (the stale-row case), and the type's end date
// lands on the probation record.

const db = vi.hoisted(() => ({
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  onboardingRecord: { updateMany: vi.fn() },
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
);

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/blob", () => ({ uploadDocument: vi.fn() }));
vi.mock("@/lib/logins", () => ({ provisionLogin: vi.fn() }));

const { updateEmployee } = await import("./actions");

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
  process.env.BLIND_INDEX_KEY = "b".repeat(64);
});

// Krupa K R: employee is on Probation, her onboarding row still says Contract.
function krupaForm(extra: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = {
    empId: "C2M000069",
    name: "Krupa K R",
    workEmail: "krupa@madarth.com",
    personalEmail: "krupa@gmail.com",
    phone: "9876543210",
    department: "Writer's Pod",
    designation: "SMM",
    dateOfJoining: "2026-05-14",
    empType: "PROBATION",
    typeEndDate: "2026-11-14",
    ...extra,
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function save(form: FormData) {
  try {
    return { state: await updateEmployee("emp69", {}, form) };
  } catch (error) {
    return { redirectedTo: (error as { url?: string }).url };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findFirst.mockResolvedValue(null); // no duplicates
  db.employee.findUnique.mockResolvedValue({
    empType: "PROBATION",
    probation: { status: "PENDING" },
  });
  db.employee.update.mockResolvedValue({ id: "emp69" });
  db.onboardingRecord.updateMany.mockResolvedValue({ count: 1 });
});

describe("updateEmployee", () => {
  it("brings a stale onboarding row in line on an unchanged save", async () => {
    const result = await save(krupaForm());
    expect(result.redirectedTo).toBe("/employees/emp69");
    expect(db.onboardingRecord.updateMany).toHaveBeenCalledWith({
      where: { employeeId: "emp69" },
      data: {
        joinDate: new Date("2026-05-14"),
        designation: "SMM",
        empType: "PROBATION",
      },
    });
  });

  it("keeps the probation due date that was already set", async () => {
    await save(krupaForm());
    expect(db.employee.update.mock.calls[0][0].data.probation).toEqual({
      update: { dueDate: new Date("2026-11-14T00:00:00Z") },
    });
  });

  it("writes nothing when the form is invalid", async () => {
    const result = await save(krupaForm({ dateOfJoining: "" }));
    expect(result.state?.fieldErrors?.dateOfJoining).toBeDefined();
    expect(db.employee.update).not.toHaveBeenCalled();
    expect(db.onboardingRecord.updateMany).not.toHaveBeenCalled();
  });
});
