import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.hoisted(() => vi.fn());
const syncBasecampJobs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac", () => ({ currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/assign/jobs-sync", () => ({
  syncBasecampJobs,
  summarizeJobsSync: () => "1 completed to-dos",
}));

const { POST } = await import("./route");

async function lines(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue({ id: "hr", role: "HR_ADMIN" });
});

describe("POST /api/basecamp/jobs-sync", () => {
  it("refuses anyone but HR admins", async () => {
    currentUser.mockResolvedValue({ id: "m", role: "MANAGER" });
    expect((await POST()).status).toBe(403);
    currentUser.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(syncBasecampJobs).not.toHaveBeenCalled();
  });

  it("streams progress then the result", async () => {
    const result = { todos: 1, created: 1 };
    syncBasecampJobs.mockImplementation(async (onProgress) => {
      onProgress({ type: "total", total: 1 });
      return result;
    });
    const response = await POST();
    expect(response.headers.get("content-type")).toContain("ndjson");
    expect(await lines(response)).toEqual([
      { type: "total", total: 1 },
      { type: "done", summary: "1 completed to-dos", result },
    ]);
  });

  it("ends with an error line when the sync throws", async () => {
    syncBasecampJobs.mockRejectedValue(new Error("Basecamp isn't connected"));
    expect(await lines(await POST())).toEqual([
      { type: "error", message: "Basecamp isn't connected" },
    ]);
  });
});
