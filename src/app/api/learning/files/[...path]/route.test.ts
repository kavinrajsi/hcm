import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const files = vi.hoisted(() => ({
  canReadFile: vi.fn(),
  signedReadUrl: vi.fn(async (key: string, options: { download: boolean }) =>
    `https://store.private.blob.vercel-storage.com/${key}?sig=1${options.download ? "&download=1" : ""}`,
  ),
}));
vi.mock("@/lib/learning/files", () => files);
vi.mock("@/lib/rbac", () => ({ requireUser: vi.fn(async () => ({ id: "u1", role: "EMPLOYEE" })) }));

const { GET } = await import("./route");

const call = (path: string[], query = "") =>
  GET(new NextRequest(`https://h/api/learning/files/${path.join("/")}${query}`), {
    params: Promise.resolve({ path }),
  });

beforeEach(() => vi.clearAllMocks());

describe("learning files", () => {
  it("refuses a file from a course the reader can't open", async () => {
    files.canReadFile.mockResolvedValue(false);
    const response = await call(["learning", "pdf", "deck.pdf"]);
    expect(response.status).toBe(403);
    expect(files.signedReadUrl).not.toHaveBeenCalled();
  });

  it("redirects to a short-lived signed URL, never cached", async () => {
    files.canReadFile.mockResolvedValue(true);
    const response = await call(["learning", "video", "intro.mp4"]);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("learning/video/intro.mp4?sig=1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("passes ?download=1 through", async () => {
    files.canReadFile.mockResolvedValue(true);
    const response = await call(["learning", "pdf", "deck.pdf"], "?download=1");
    expect(response.headers.get("location")).toContain("download=1");
  });
});
