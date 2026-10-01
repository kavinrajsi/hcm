import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolSet } from "ai";
import type { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { WRITE_TOOLS, buildTools, loadContext } from "@/lib/madmax/tools";

// The HCM MCP server: MadMax's role-scoped tools, offered to whatever AI app
// the user connected (Claude, ChatGPT, Cursor…). Tools re-check scope
// against the signed-in user, never against what the model sends. Writes
// are marked so the app asks the user first, and every write is audited.

export const MCP_INSTRUCTIONS =
  "HCM is Madarth's HR system. Tools act as the signed-in user and only see what their role allows " +
  "(employees: their own data; managers: their team; HR: everyone). Dates are YYYY-MM-DD in IST. " +
  "Confirm with the user before any tool that changes data.";

const WRITES = new Set<string>(WRITE_TOOLS);

/** The signed-in user as rbac sees them, or null if gone or disabled. */
export async function sessionUserFor(userId: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, disabledAt: true },
  });
  return user && !user.disabledAt ? { id: user.id, role: user.role, email: user.email } : null;
}

type AnyTool = {
  description?: string;
  inputSchema: unknown;
  execute?: (input: unknown, options: { toolCallId: string; messages: [] }) => unknown;
};

/** Tools for this user, as MCP tools. */
export async function registerHcmTools(
  server: McpServer,
  grant: { userId: string; clientName: string },
): Promise<void> {
  const user = await sessionUserFor(grant.userId);
  if (!user) return;
  const tools: ToolSet = buildTools(await loadContext(user));

  for (const [name, definition] of Object.entries(tools) as [string, AnyTool][]) {
    const write = WRITES.has(name);
    server.registerTool(
      name,
      {
        description: definition.description,
        // Zod schemas implement Standard Schema, which the MCP SDK accepts.
        inputSchema: definition.inputSchema as z.ZodObject<z.ZodRawShape>,
        annotations: {
          readOnlyHint: !write,
          destructiveHint: false,
          idempotentHint: !write,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await definition.execute?.(args ?? {}, { toolCallId: `mcp-${name}`, messages: [] });
          if (write) await audit(grant, name, args, true, null);
          return { content: [{ type: "text" as const, text: JSON.stringify(result ?? null, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool failed";
          if (write) await audit(grant, name, args, false, message);
          return { isError: true, content: [{ type: "text" as const, text: message }] };
        }
      },
    );
  }
}

async function audit(
  grant: { userId: string; clientName: string },
  tool: string,
  input: unknown,
  ok: boolean,
  error: string | null,
) {
  await db.mcpAuditLog
    .create({
      data: {
        userId: grant.userId,
        clientName: grant.clientName,
        tool,
        input: JSON.parse(JSON.stringify(input ?? {})),
        ok,
        error,
      },
    })
    .catch((failure) => console.error("[mcp] audit write failed", failure));
}
