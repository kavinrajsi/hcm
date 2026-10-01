import { beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ appSetting: { findUnique: vi.fn(), upsert: vi.fn() } }));
const deleteDocument = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ put }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/blob", () => ({ deleteDocument }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "hr1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { uploadGuideShot, removeGuideShot } = await import("./guide-actions");
const form = (file: string, image?: File) => {
  const data = new FormData();
  data.set("file", file);
  if (image) data.set("image", image);
  return data;
};
const png = (bytes = 10) => new File([new Uint8Array(bytes)], "s.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  db.appSetting.findUnique.mockResolvedValue(null);
  put.mockResolvedValue({ pathname: "mcp-guide/claude-1-settings.png" });
  deleteDocument.mockResolvedValue(undefined);
});

describe("guide screenshots", () => {
  it("uploads to private storage and records it", async () => {
    expect(await uploadGuideShot({}, form("claude-1-settings.png", png()))).toEqual({ ok: true });
    expect(put).toHaveBeenCalledWith("mcp-guide/claude-1-settings.png", expect.any(File), expect.objectContaining({ access: "private", allowOverwrite: true }));
    const value = db.appSetting.upsert.mock.calls[0][0].update.value;
    expect(value["claude-1-settings.png"].pathname).toBe("mcp-guide/claude-1-settings.png");
  });

  it("shows problems under the file input", async () => {
    expect((await uploadGuideShot({}, form("claude-1-settings.png"))).fieldErrors?.image).toEqual(["Choose a screenshot"]);
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect((await uploadGuideShot({}, form("claude-1-settings.png", pdf))).fieldErrors?.image?.[0]).toMatch(/PNG/);
    expect((await uploadGuideShot({}, form("claude-1-settings.png", png(6 * 1024 * 1024)))).fieldErrors?.image?.[0]).toMatch(/5 MB/);
    expect((await uploadGuideShot({}, form("../etc/passwd", png()))).error).toBe("Unknown screenshot.");
    expect(put).not.toHaveBeenCalled();
  });

  it("removes one", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { "claude-1-settings.png": { pathname: "mcp-guide/x.png", version: 1 } } });
    await removeGuideShot(form("claude-1-settings.png"));
    expect(db.appSetting.upsert.mock.calls[0][0].update.value).toEqual({});
    expect(deleteDocument).toHaveBeenCalledWith("mcp-guide/x.png");
  });
});
