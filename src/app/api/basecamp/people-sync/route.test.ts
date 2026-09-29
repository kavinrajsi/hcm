import { beforeEach, describe, expect, it, vi } from "vitest";

// The streamed people sync: HR only, progress lines, then a "done" line
// (or "error" when the sync throws).

const currentUser = vi.hoisted(() => vi.fn());
const syncBasecampPeople = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac", () => ({ currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/basecamp-people", () => ({
  syncBasecampPeople,
  summarize: () => "1 of 1 people matched",
}));

const { POST } = await import("./route");

async function lines(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue({ id: "hr", role: "HR_ADMIN" });
});

describe("POST /api/basecamp/people-sync", () => {
  it("refuses anyone but HR admins", async () => {
    currentUser.mockResolvedValue({ id: "m", role: "MANAGER" });
    expect((await POST()).status).toBe(403);
    currentUser.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(syncBasecampPeople).not.toHaveBeenCalled();
  });

  it("streams progress and ends with the result", async () => {
    const result = {
      people: 1,
      matched: 1,
      updated: 1,
      unchanged: 0,
      unmatched: [],
      failed: 0,
    };
    syncBasecampPeople.mockImplementation(async (onProgress) => {
      onProgress({ type: "step", message: "Connecting to Basecamp…" });
      onProgress({ type: "total", total: 1 });
      onProgress({
        type: "person",
        empId: "PBCH0027",
        name: "Sridhar",
        status: "updated",
      });
      return result;
    });
    const response = await POST();
    expect(response.headers.get("content-type")).toContain("ndjson");
    expect(await lines(response)).toEqual([
      { type: "step", message: "Connecting to Basecamp…" },
      { type: "total", total: 1 },
      {
        type: "person",
        empId: "PBCH0027",
        name: "Sridhar",
        status: "updated",
      },
      { type: "done", summary: "1 of 1 people matched", result },
    ]);
  });

  it("ends with an error line when the sync fails", async () => {
    syncBasecampPeople.mockRejectedValue(new Error("Basecamp isn't connected"));
    expect(await lines(await POST())).toEqual([
      { type: "error", message: "Basecamp isn't connected" },
    ]);
  });
});
