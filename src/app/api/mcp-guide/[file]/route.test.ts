import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ appSetting: { findUnique: vi.fn() } }));
const readDocument = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/blob", () => ({ readDocument }));

const { GET } = await import("./route");
const get = (file: string) => GET(new Request(`https://h/api/mcp-guide/${file}`), { params: Promise.resolve({ file }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.appSetting.findUnique.mockResolvedValue({ value: { "claude-1-settings.png": { pathname: "mcp-guide/claude-1-settings.png", version: 5 } } });
  readDocument.mockResolvedValue({ stream: new Blob(["img"]).stream(), headers: new Headers({ "content-type": "image/png" }) });
});

describe("guide screenshot route", () => {
  it("serves an uploaded screenshot, cacheable", async () => {
    const response = await get("claude-1-settings.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("404s for missing or unknown files", async () => {
    expect((await get("claude-2-connectors.png")).status).toBe(404);
    expect((await get("secret.png")).status).toBe(404);
    expect(readDocument).toHaveBeenCalledTimes(0);
  });
});
