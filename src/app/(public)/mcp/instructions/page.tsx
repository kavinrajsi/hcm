import { headers } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { WRITE_TOOLS, buildTools, toolNamesFor } from "@/lib/madmax/tools";
import { issuer } from "@/lib/oauth/http";
import { CopyButton } from "./copy-button";

export const metadata = {
  title: "Use HCM from your AI assistant",
  description: "Connect Claude, ChatGPT, Cursor and other AI assistants to HCM.",
};

const ROLE_NAMES: Record<Role, string> = { EMPLOYEE: "Everyone", MANAGER: "Managers also", HR_ADMIN: "HR also" };
const WRITES = new Set<string>(WRITE_TOOLS);

/** Tool name → description, straight from the tool definitions. */
function toolCatalogue() {
  const tools = buildTools({
    user: { id: "", role: "HR_ADMIN", email: "" },
    employeeId: null,
    displayName: "",
  }) as Record<string, { description?: string }>;
  const seen = new Set<string>();
  return (["EMPLOYEE", "MANAGER", "HR_ADMIN"] as Role[]).map((role) => {
    const names = toolNamesFor(role).filter((name) => !seen.has(name));
    names.forEach((name) => seen.add(name));
    return {
      role,
      tools: names.map((name) => ({ name, description: tools[name]?.description ?? "", write: WRITES.has(name) })),
    };
  });
}

function Code({ children }: { children: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md bg-zinc-100 p-3 dark:bg-zinc-900">
      <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre">{children}</pre>
      <CopyButton text={children} />
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

export default async function McpInstructionsPage() {
  const requestHeaders = await headers();
  const base = issuer(
    new Request(`${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host") ?? "localhost:3000"}/`, {
      headers: requestHeaders,
    }),
  );
  const url = `${base}/api/mcp`;
  const catalogue = toolCatalogue();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:py-16">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">HCM · Madarth</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Use HCM from your AI assistant</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Ask Claude, ChatGPT, Cursor or any assistant that supports MCP about your leave, team, devices and more.
        It signs in as you and sees only what you can see in HCM.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">MCP server URL</h2>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
          <CopyButton text={url} label="Copy URL" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          When you add it, a browser window opens: sign in to HCM and click <strong>Allow</strong>.
        </p>
      </section>

      <h2 className="mt-10 text-lg font-semibold">Set it up</h2>
      <div className="mt-3 grid gap-3">
        <Step title="Claude (claude.ai, desktop and mobile)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open <strong>Settings → Connectors</strong>.</li>
            <li>Choose <strong>Add custom connector</strong>, name it <em>HCM</em>, paste the URL above, and add it.</li>
            <li>Click <strong>Connect</strong>, sign in to HCM and allow. Then ask away in any chat.</li>
          </ol>
        </Step>
        <Step title="ChatGPT">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              In <strong>Settings → Apps</strong> (Advanced), turn on <strong>Developer mode</strong>.
            </li>
            <li>Create a new app/connector, name it <em>HCM</em>, paste the URL, authentication <strong>OAuth</strong>.</li>
            <li>Sign in to HCM and allow. In a chat, pick it from <strong>+ → More → Developer mode</strong>.</li>
          </ol>
        </Step>
        <Step title="Claude Code">
          <Code>{`claude mcp add --transport http hcm ${url}`}</Code>
          <p className="mt-2">Then run <code>/mcp</code> in Claude Code and choose HCM to sign in.</p>
        </Step>
        <Step title="Cursor and other MCP apps">
          <p>Add this to your MCP config (Cursor: <code>~/.cursor/mcp.json</code>), then sign in when asked:</p>
          <Code>{JSON.stringify({ mcpServers: { hcm: { url } } }, null, 2)}</Code>
          <p className="mt-2">Apps that only support local (stdio) servers can use the bridge:</p>
          <Code>{JSON.stringify({ mcpServers: { hcm: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2)}</Code>
        </Step>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Things to ask</h2>
      <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        {[
          "How many leave days have I taken this year?",
          "Who in my team is on leave next week?",
          "Which laptop do I have, and when was it given to me?",
          "Show pending leave requests from my team and approve Priya's.",
          "Whose probation is due this month?",
          "List the candidates in Interview for the Designer role.",
        ].map((example) => (
          <li key={example} className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
            &ldquo;{example}&rdquo;
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">What it can do</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Tools marked <span className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">changes data</span>{" "}
        change data. Most AI apps ask you before running them, and every change is logged in HCM.
      </p>
      <div className="mt-3 grid gap-6">
        {catalogue.map((group) => (
          <section key={group.role}>
            <h3 className="text-sm font-semibold">{ROLE_NAMES[group.role]}</h3>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              {group.tools.map((tool) => (
                <li key={tool.name} className="px-4 py-2">
                  <span className="font-mono text-xs">{tool.name}</span>
                  {tool.write && (
                    <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      changes data
                    </span>
                  )}
                  <span className="block text-zinc-600 dark:text-zinc-400">{tool.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Privacy</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>Your assistant signs in as you and sees only what your HCM role allows.</li>
        <li>PAN, Aadhaar and bank details are never shared.</li>
        <li>Disconnect any time from HCM → My Profile → Connected AI apps. If your HCM account is disabled, every connection stops at once.</li>
        <li>What you send to your AI app is handled by that app&rsquo;s own privacy terms.</li>
      </ul>
    </main>
  );
}
