import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { listConnections } from "@/lib/mcp/connections";
import { formatDateTime } from "@/lib/format-date";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { disconnectAnyApp } from "./actions";
import { AdminSetup } from "./admin-setup";
import { shotUrls } from "@/lib/mcp-guide-store";

export const metadata = { title: "MCP access" };

// HR: who has connected an AI app to HCM, and every change made through one.
export default async function McpAccessPage() {
  await requirePageRole("HR_ADMIN");
  const [connections, log, shots] = await Promise.all([
    listConnections(),
    db.mcpAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, clientName: true, tool: true, input: true, ok: true, error: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    shotUrls(),
  ]);
  return (
    <PageShell width="md">
      <PageHeader
        title="MCP access"
        description="AI apps (Claude, ChatGPT, Cursor…) connected to HCM, and the changes they made."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/mcp/instructions" />}>
            Setup instructions
          </Button>
        }
      />
      <section className="mt-6">
        <h2 className="text-base font-semibold">Connected apps ({connections.length})</h2>
        {connections.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nobody has connected an AI app yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {connections.map((connection) => (
              <li key={`${connection.userId}-${connection.clientId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-medium">{connection.userName}</span> · {connection.clientName}
                  <span className="block text-xs text-zinc-500">
                    Connected {formatDateTime(connection.connectedAt)}
                    {connection.lastUsedAt ? ` · last used ${formatDateTime(connection.lastUsedAt)}` : ""}
                  </span>
                </span>
                <form action={disconnectAnyApp}>
                  <input type="hidden" name="clientId" value={connection.clientId} />
                  <input type="hidden" name="userId" value={connection.userId} />
                  <Button type="submit" size="sm" variant="destructive">
                    Disconnect
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-base font-semibold">Changes made through MCP</h2>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {log.map((row) => (
              <li key={row.id} className="px-4 py-2">
                <p>
                  <span className="font-mono">{row.tool}</span>
                  <span className={row.ok ? "ml-2 text-xs text-emerald-600" : "ml-2 text-xs text-red-600"}>
                    {row.ok ? "done" : `failed: ${row.error}`}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  {formatDateTime(row.createdAt)} · {row.user?.name || row.user?.email || "unknown"} via {row.clientName}
                </p>
                <pre className="mt-1 overflow-x-auto text-xs text-zinc-500">{JSON.stringify(row.input)}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AdminSetup authUrl={process.env.AUTH_URL} shots={shots} />
    </PageShell>
  );
}
