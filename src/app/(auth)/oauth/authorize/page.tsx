import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { db } from "@/lib/db";
import { isKnownReturnAddress, redirectUriMatches, resolveClient } from "@/lib/oauth/clients";
import { decide } from "./actions";

export const metadata = { title: "Allow access", robots: { index: false } };

const ROLE_LABELS = { HR_ADMIN: "HR admin", MANAGER: "manager", EMPLOYEE: "employee" } as const;

function Problem({ text }: { text: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Can&rsquo;t connect</h1>
        <p className="mt-2 text-sm text-zinc-500">{text}</p>
      </div>
    </main>
  );
}

// OAuth consent: an AI app (Claude, ChatGPT…) asks to use HCM as you.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const param = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  if (param("error")) return <Problem text="The request from the app wasn't valid. Start connecting again from the app." />;

  const client = await resolveClient(param("client_id"));
  const redirectUri = param("redirect_uri");
  // Never redirect to an unverified URI: show the problem here instead.
  if (!client) return <Problem text="This app isn't known to HCM. Remove the connector and add it again." />;
  if (!redirectUriMatches(client.redirectUris, redirectUri))
    return <Problem text="The app's return address doesn't match what it registered." />;
  if (param("response_type") !== "code" || param("code_challenge_method") !== "S256" || !param("code_challenge"))
    return <Problem text="The app must use the authorization code flow with PKCE (S256)." />;

  const user = await currentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(
      Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(here)}`);
  }
  const profile = await db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
  const returnHost = new URL(redirectUri).host || new URL(redirectUri).protocol;
  const verified = isKnownReturnAddress(redirectUri);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">HCM · Madarth</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Allow <span className="break-words">{client.name}</span> to use HCM as you?
        </h1>
        <p className="mt-3 text-sm">
          Signed in as <span className="font-medium">{profile?.name ?? profile?.email}</span> ({ROLE_LABELS[user.role]}).
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>It can read what you can see in HCM, and make changes you could make, such as approving leave.</li>
          <li>Most AI apps ask you before running anything that changes data. Every change is logged in HCM.</li>
          <li>PAN, Aadhaar and bank details are never shared.</li>
          <li>Disconnect any time from My Profile → Connected AI apps.</li>
        </ul>
        <div
          className={
            verified
              ? "mt-4 rounded-md bg-muted px-3 py-2 text-sm"
              : "mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          }
        >
          {!verified && <p className="font-semibold">Unverified app — make sure you started this connection yourself.</p>}
          <p>
            After you allow, HCM sends you back to <span className="font-mono font-semibold">{returnHost}</span>.
          </p>
        </div>
        <form action={decide} className="mt-6 flex gap-3">
          {[
            ["client_id", client.id],
            ["redirect_uri", redirectUri],
            ["state", param("state")],
            ["code_challenge", param("code_challenge")],
            ["resource", param("resource")],
          ].map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button
            name="decision"
            value="allow"
            className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Allow
          </button>
          <button
            name="decision"
            value="deny"
            className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Deny
          </button>
        </form>
      </div>
    </main>
  );
}
