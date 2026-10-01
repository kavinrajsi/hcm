import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  mcpAuditLog: { create: vi.fn() },
}));
const tools = vi.hoisted(() => ({
  listDevices: { description: "Read devices", inputSchema: {}, execute: vi.fn(async () => [{ assetTag: "MAD-LAP-0001" }]) },
  reviewLeave: { description: "Approve leave", inputSchema: {}, execute: vi.fn(async () => ({ ok: true })) },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/madmax/tools", () => ({
  WRITE_TOOLS: ["reviewLeave"],
  loadContext: vi.fn(async (user: unknown) => ({ user })),
  buildTools: vi.fn(() => tools),
}));

const { registerHcmTools } = await import("./server");

type Registered = { config: { annotations: Record<string, boolean>; description?: string }; handler: (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }> };
function fakeServer() {
  const registered = new Map<string, Registered>();
  return {
    registered,
    server: { registerTool: (name: string, config: Registered["config"], handler: Registered["handler"]) => registered.set(name, { config, handler }) },
  };
}
const grant = { userId: "u1", clientName: "Claude" };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", role: "HR_ADMIN", email: "hr@madarth.com", disabledAt: null });
  db.mcpAuditLog.create.mockResolvedValue({});
});

describe("registerHcmTools", () => {
  it("offers the user's tools, marking writes so the app asks first", async () => {
    const { server, registered } = fakeServer();
    await registerHcmTools(server as never, grant);
    expect([...registered.keys()]).toEqual(["listDevices", "reviewLeave"]);
    expect(registered.get("listDevices")!.config.annotations.readOnlyHint).toBe(true);
    expect(registered.get("reviewLeave")!.config.annotations.readOnlyHint).toBe(false);
  });

  it("returns read results as JSON and doesn't audit reads", async () => {
    const { server, registered } = fakeServer();
    await registerHcmTools(server as never, grant);
    const result = await registered.get("listDevices")!.handler({});
    expect(JSON.parse(result.content[0].text)).toEqual([{ assetTag: "MAD-LAP-0001" }]);
    expect(db.mcpAuditLog.create).not.toHaveBeenCalled();
  });

  it("audits every write, including failures", async () => {
    const { server, registered } = fakeServer();
    await registerHcmTools(server as never, grant);
    await registered.get("reviewLeave")!.handler({ entryId: "l1", decision: "APPROVED" });
    expect(db.mcpAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", clientName: "Claude", tool: "reviewLeave", ok: true, input: { entryId: "l1", decision: "APPROVED" } }),
    });
    tools.reviewLeave.execute.mockRejectedValueOnce(new Error("That employee isn't in your scope."));
    const failed = await registered.get("reviewLeave")!.handler({ entryId: "l2" });
    expect(failed.isError).toBe(true);
    expect(db.mcpAuditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ ok: false, error: "That employee isn't in your scope." }),
    });
  });

  it("offers nothing to a disabled or deleted user", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "HR_ADMIN", email: "x", disabledAt: new Date() });
    const { server, registered } = fakeServer();
    await registerHcmTools(server as never, grant);
    expect(registered.size).toBe(0);
  });
});
