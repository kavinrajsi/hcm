import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const files = vi.hoisted(() => ({
  canReadFile: vi.fn(),
  signedReadUrl: vi.fn(async (key: string) => `https://store.private.blob.vercel-storage.com/${key}?sig=1`),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/learning/files", async (original) => ({
  ...(await original<typeof import("@/lib/learning/files")>()),
  ...files,
}));
vi.mock("@/lib/rbac", () => ({ requireUser: vi.fn(async () => ({ id: "u1", role: "EMPLOYEE" })) }));

const { GET } = await import("./route");
const { CHUNK_BYTES, chunkRange } = await import("@/lib/learning/files");

const fetchMock = vi.fn();
const call = (path: string[], headers: Record<string, string> = {}, query = "") =>
  GET(new NextRequest(`https://h/api/learning/files/${path.join("/")}${query}`, { headers }), {
    params: Promise.resolve({ path }),
  });

function upstream(status: number, headers: Record<string, string>) {
  return new Response("bytes", { status, headers: { "content-type": "video/mp4", ...headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  files.canReadFile.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("chunkRange", () => {
  it("caps open and oversized ranges to one chunk", () => {
    expect(chunkRange(null)).toEqual({ start: 0, end: CHUNK_BYTES - 1 });
    expect(chunkRange("bytes=100-")).toEqual({ start: 100, end: 100 + CHUNK_BYTES - 1 });
    expect(chunkRange("bytes=0-99")).toEqual({ start: 0, end: 99 });
    expect(chunkRange("bytes=0-99999999")?.end).toBe(CHUNK_BYTES - 1);
  });

  it("rejects ranges it can't serve", () => {
    expect(chunkRange("bytes=-500")).toBeNull();
    expect(chunkRange("bytes=9-3")).toBeNull();
    expect(chunkRange("items=0-1")).toBeNull();
  });
});

describe("learning files", () => {
  it("refuses a file from a course the reader can't open", async () => {
    files.canReadFile.mockResolvedValue(false);
    expect((await call(["learning", "pdf", "deck.pdf"])).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a video range through, capped, as a 206 from HCM's own domain", async () => {
    fetchMock.mockResolvedValue(
      upstream(206, { "content-range": `bytes 0-${CHUNK_BYTES - 1}/50000000`, "content-length": String(CHUNK_BYTES) }),
    );
    const response = await call(["learning", "video", "intro.mp4"], { range: "bytes=0-" });
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe(`bytes=0-${CHUNK_BYTES - 1}`);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-${CHUNK_BYTES - 1}/50000000`);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // The store's CSP (which blanks PDF viewers) isn't passed on.
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("sends a small file whole to a plain request", async () => {
    fetchMock.mockResolvedValue(upstream(206, { "content-range": "bytes 0-397/398", "content-length": "398" }));
    const response = await call(["learning", "image", "cover.png"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
  });

  it("marks downloads as attachments", async () => {
    fetchMock.mockResolvedValue(upstream(206, { "content-range": "bytes 0-397/398" }));
    const response = await call(["learning", "pdf", "deck.pdf"], {}, "?download=1");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("reports a storage failure as 502, not the store's error page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));
    expect((await call(["learning", "pdf", "deck.pdf"])).status).toBe(502);
  });

  it("refuses a malformed range", async () => {
    expect((await call(["learning", "video", "a.mp4"], { range: "bytes=-5" })).status).toBe(416);
  });
});
