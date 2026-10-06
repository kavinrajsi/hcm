import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ roleCriteria: { upsert: vi.fn(), deleteMany: vi.fn() } }));
const rbac = vi.hoisted(() => ({ requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => rbac);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveRoleCriteria } = await import("./actions");
const form = (role: string, criteria: string) => {
  const data = new FormData();
  data.set("role", role);
  data.set("criteria", criteria);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("saveRoleCriteria", () => {
  it("is HR only", async () => {
    await saveRoleCriteria({}, form("Video Editor", "x"));
    expect(rbac.requireRole).toHaveBeenCalledWith("HR_ADMIN");
  });

  it("saves under the lowercased role, so spellings share one entry", async () => {
    await saveRoleCriteria({}, form("Video Editor", "  Premiere, reels  "));
    expect(db.roleCriteria.upsert.mock.calls[0][0]).toMatchObject({
      where: { roleKey: "video editor" },
      create: { roleKey: "video editor", role: "Video Editor", criteria: "Premiere, reels", updatedById: "hr" },
    });
  });

  it("clears the criteria when emptied", async () => {
    await saveRoleCriteria({}, form("Video Editor", "   "));
    expect(db.roleCriteria.deleteMany).toHaveBeenCalledWith({ where: { roleKey: "video editor" } });
    expect(db.roleCriteria.upsert).not.toHaveBeenCalled();
  });
});
