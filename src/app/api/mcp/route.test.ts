import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/oauth/grants", () => ({ verifyAccessToken }));
vi.mock("@/lib/mcp/server", () => ({ MCP_INSTRUCTIONS: "", registerHcmTools: vi.fn() }));

const { POST } = await import("./route");

const call = (token?: string) =>
  POST(
    new Request("https://hcm.example.com/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );

beforeEach(() => vi.clearAllMocks());

describe("/api/mcp", () => {
  it("answers 401 with the sign-in metadata pointer when no token is sent", async () => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://hcm.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("refuses an invalid or revoked token", async () => {
    verifyAccessToken.mockResolvedValue(null);
    expect((await call("bad")).status).toBe(401);
    expect(verifyAccessToken).toHaveBeenCalledWith("bad");
  });
});
