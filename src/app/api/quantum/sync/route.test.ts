import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({ lastQuantumSync: vi.fn(), syncQuantumTodos: vi.fn() }));
vi.mock("@/lib/quantum/sync", () => sync);
const rbac = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("@/lib/rbac", () => rbac);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("./route");

const events = async (response: Response) =>
  (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

beforeEach(() => {
  vi.clearAllMocks();
  rbac.currentUser.mockResolvedValue({ id: "u1", role: "HR_ADMIN" });
  sync.lastQuantumSync.mockResolvedValue(new Date());
});

describe("POST /api/quantum/sync", () => {
  it("needs HR or a manager", async () => {
    rbac.currentUser.mockResolvedValueOnce(null);
    expect((await POST()).status).toBe(401);
    rbac.currentUser.mockResolvedValueOnce({ id: "u2", role: "EMPLOYEE" });
    expect((await POST()).status).toBe(403);
    expect(sync.syncQuantumTodos).not.toHaveBeenCalled();
  });

  it("streams each step, then the result", async () => {
    sync.syncQuantumTodos.mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: "todos", status: "active", pages: 1, saved: 2 });
      onProgress({ stage: "hours", hourEntries: 176 });
      return { since: "", pages: 1, saved: 2, hourEntries: 176 };
    });
    expect(await events(await POST())).toEqual([
      { type: "progress", stage: "todos", status: "active", pages: 1, saved: 2 },
      { type: "progress", stage: "hours", hourEntries: 176 },
      { type: "done", saved: 2, hourEntries: 176 },
    ]);
    expect(sync.syncQuantumTodos).toHaveBeenCalledWith(expect.objectContaining({ updatedById: "u1" }));
  });

  it("won't run the first 12-month load", async () => {
    sync.lastQuantumSync.mockResolvedValue(null);
    expect(await events(await POST())).toEqual([
      { type: "error", message: "The first load from Basecamp hasn't run yet." },
    ]);
    expect(sync.syncQuantumTodos).not.toHaveBeenCalled();
  });

  it("streams the Basecamp error", async () => {
    sync.syncQuantumTodos.mockRejectedValue(new Error("No HR admin has connected Basecamp"));
    expect(await events(await POST())).toEqual([
      { type: "error", message: "No HR admin has connected Basecamp" },
    ]);
  });
});
