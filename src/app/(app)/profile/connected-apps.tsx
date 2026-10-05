import Link from "next/link";
import { listConnections } from "@/lib/mcp/connections";
import { formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { disconnectMyApp } from "../mcp-access/actions";

/** Profile → Security: AI apps (Claude, ChatGPT…) connected to HCM as me. */
export async function ConnectedApps({ userId }: { userId: string }) {
  const connections = await listConnections(userId);
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Connected AI apps</h2>
        <Link href="/mcp/instructions" className="text-sm underline-offset-4 hover:underline">
          Connect an AI app
        </Link>
      </div>
      {connections.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          None. You can use HCM from Claude, ChatGPT or Cursor; see how to connect.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {connections.map((connection) => (
            <li key={connection.clientId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{connection.clientName}</span>
                <span className="block text-xs text-zinc-500">
                  Connected {formatDateTime(connection.connectedAt)}
                  {connection.lastUsedAt ? ` · last used ${formatDateTime(connection.lastUsedAt)}` : ""}
                </span>
              </span>
              <form action={disconnectMyApp}>
                <input type="hidden" name="clientId" value={connection.clientId} />
                <Button type="submit" size="sm" variant="outline">
                  Disconnect
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
