import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({
  lastQuantumSync: vi.fn(),
  syncQuantumTodos: vi.fn(),
}));
vi.mock("@/lib/quantum/sync", () => sync);
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => ({ id: "u1", role: "MANAGER" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { syncQuantum } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("syncQuantum", () => {
  it("won't run the first 12-month load from the button", async () => {
    sync.lastQuantumSync.mockResolvedValue(null);
    expect(await syncQuantum()).toEqual({ error: "The first load from Basecamp hasn't run yet." });
    expect(sync.syncQuantumTodos).not.toHaveBeenCalled();
  });

  it("reports how many to-dos changed", async () => {
    sync.lastQuantumSync.mockResolvedValue(new Date());
    sync.syncQuantumTodos.mockResolvedValue({ since: "", pages: 1, saved: 3 });
    expect(await syncQuantum()).toEqual({ ok: "Updated 3 to-dos." });
    expect(sync.syncQuantumTodos).toHaveBeenCalledWith({ updatedById: "u1" });
  });

  it("shows the Basecamp error", async () => {
    sync.lastQuantumSync.mockResolvedValue(new Date());
    sync.syncQuantumTodos.mockRejectedValue(new Error("No HR admin has connected Basecamp"));
    expect(await syncQuantum()).toEqual({ error: "No HR admin has connected Basecamp" });
  });
});
