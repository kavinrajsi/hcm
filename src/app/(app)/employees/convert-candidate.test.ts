import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// createEmployee's candidate-conversion path against a mocked database:
// the employee is linked to the candidate, a note is left on the candidate,
// the Employee login is created, and a second conversion is refused.

const db = vi.hoisted(() => ({
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  candidate: { findUnique: vi.fn(), update: vi.fn() },
}));
const provisionLogin = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
);

vi.mock("@/lib/basecamp-onboard", () => ({
  addEmployeeToBasecamp: vi.fn(async () => ({ status: "invited", personId: null })),
  ONBOARD_MESSAGES: {},
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/blob", () => ({ uploadDocument: vi.fn() }));
vi.mock("@/lib/logins", () => ({ provisionLogin }));

const { createEmployee } = await import("./actions");

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
  process.env.BLIND_INDEX_KEY = "b".repeat(64);
});

function newJoiner(extra: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = {
    empId: "E100",
    name: "Asha Rao",
    workEmail: "asha@madarth.com",
    personalEmail: "asha@gmail.com",
    phone: "9876543210",
    department: "Design",
    designation: "Graphic Designer",
    dateOfJoining: "2026-10-01",
    empType: "INTERN",
    ...extra,
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function submit(form: FormData) {
  try {
    return { state: await createEmployee({}, form) };
  } catch (error) {
    return { redirectedTo: (error as { url?: string }).url };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findFirst.mockResolvedValue(null); // no duplicates
  db.employee.findUnique.mockResolvedValue(null); // not converted yet
  db.employee.create.mockImplementation(async ({ data }) => ({
    id: "emp1",
    empId: data.empId,
    name: data.name,
    workEmail: data.workEmail,
  }));
  db.candidate.findUnique.mockResolvedValue({
    notes: JSON.stringify([
      { id: "1", text: "Great portfolio", timestamp: "2026-09-01T00:00:00Z" },
    ]),
  });
});

describe("Convert candidate → employee", () => {
  it("links the employee to the candidate and redirects to it", async () => {
    const result = await submit(newJoiner({ candidateId: "1277" }));
    expect(result.redirectedTo).toBe("/devices/provision/emp1?new=1&basecamp=invited");
    expect(db.employee.create.mock.calls[0][0].data.candidateId).toBe(
      BigInt(1277),
    );
  });

  it("saves the father's name on create (null when left blank)", async () => {
    await submit(newJoiner({ fatherName: "Ravi Rao" }));
    expect(db.employee.create.mock.calls[0][0].data.fatherName).toBe(
      "Ravi Rao",
    );
    await submit(newJoiner({ empId: "E101" }));
    expect(db.employee.create.mock.calls[1][0].data.fatherName).toBeNull();
  });

  it("flags an oversize photo on the photo field before uploading", async () => {
    const form = newJoiner();
    form.set(
      "photo",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "me.jpg", {
        type: "image/jpeg",
      }),
    );
    const result = await submit(form);
    expect(result.state?.fieldErrors?.photo?.[0]).toMatch(/10 MB/);
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it("adds a 'Converted to employee' note and keeps existing notes", async () => {
    await submit(newJoiner({ candidateId: "1277" }));
    const update = db.candidate.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: BigInt(1277) });
    const notes = JSON.parse(update.data.notes);
    expect(notes.map((note: { text: string }) => note.text)).toEqual([
      "Great portfolio",
      "Converted to employee E100",
    ]);
  });

  it("creates the Employee login for the new joiner", async () => {
    await submit(newJoiner({ candidateId: "1277" }));
    expect(provisionLogin).toHaveBeenCalledWith({
      email: "asha@madarth.com",
      name: "Asha Rao",
      role: "EMPLOYEE",
      employeeId: "emp1",
    });
  });

  it("refuses a candidate who was already converted", async () => {
    db.employee.findUnique.mockResolvedValue({ id: "emp0" });
    const result = await submit(newJoiner({ candidateId: "1277" }));
    expect(result.state?.error).toMatch(/already been converted/);
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.candidate.update).not.toHaveBeenCalled();
  });

  it("still creates the employee if writing the candidate note fails", async () => {
    db.candidate.update.mockRejectedValue(new Error("db hiccup"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await submit(newJoiner({ candidateId: "1277" }));
    expect(result.redirectedTo).toBe("/devices/provision/emp1?new=1&basecamp=invited");
    expect(provisionLogin).toHaveBeenCalled();
  });

  it("ignores a malformed candidateId and adds a plain employee", async () => {
    const result = await submit(newJoiner({ candidateId: "1277; drop" }));
    expect(result.redirectedTo).toBe("/devices/provision/emp1?new=1&basecamp=invited");
    expect(
      db.employee.create.mock.calls[0][0].data.candidateId,
    ).toBeUndefined();
    expect(db.candidate.update).not.toHaveBeenCalled();
  });

  it("accepts the form's blank Gender option ('—' posts an empty value)", async () => {
    const result = await submit(newJoiner({ gender: "", candidateId: "1277" }));
    expect(result.redirectedTo).toBe("/devices/provision/emp1?new=1&basecamp=invited");
    expect(db.employee.create.mock.calls[0][0].data.gender).toBeUndefined();
  });

  it("still rejects a gender that isn't one of the options", async () => {
    const result = await submit(newJoiner({ gender: "X" }));
    expect(result.state?.fieldErrors?.gender).toBeDefined();
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it("adds a normal employee without any candidate", async () => {
    await submit(newJoiner());
    expect(
      db.employee.create.mock.calls[0][0].data.candidateId,
    ).toBeUndefined();
    expect(db.candidate.findUnique).not.toHaveBeenCalled();
  });
});
