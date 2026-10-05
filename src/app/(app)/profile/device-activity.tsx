import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { describeDevice, describePlace, isActive, SESSION_MAX_AGE_MS } from "@/lib/login-sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutDevice, signOutOtherDevices } from "./actions";

/** My Profile: every browser/device signed in as me, active and inactive. */
export async function DeviceActivity({
  userId,
  currentSessionId,
}: {
  userId: string;
  currentSessionId?: string;
}) {
  const sessions = await db.loginSession.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });
  const active = sessions.filter(isActive);
  const inactive = sessions.filter((session) => !isActive(session));
  const others = active.filter((session) => session.id !== currentSessionId);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Device activity</h2>
        {others.length > 0 ? (
          <form action={signOutOtherDevices}>
            <Button type="submit" size="sm" variant="outline">
              Sign out of all other devices
            </Button>
          </form>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Where you&apos;re signed in. Don&apos;t recognise one? Sign it out and change your password.
      </p>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No sign-ins recorded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {[...active, ...inactive].map((session) => {
            const live = isActive(session);
            const current = session.id === currentSessionId;
            const status = current
              ? "This device"
              : live
                ? "Active"
                : session.revokedAt
                  ? "Signed out"
                  : "Expired";
            const ended = session.revokedAt
              ? `signed out ${formatDateTime(session.revokedAt)}`
              : !live
                ? `expired ${formatDateTime(new Date(session.lastSeenAt.getTime() + SESSION_MAX_AGE_MS))}`
                : `last active ${formatDateTime(session.lastSeenAt)}`;
            return (
              <li
                key={session.id}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${live ? "" : "text-zinc-500"}`}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{describeDevice(session.userAgent)}</span>
                    <Badge variant={live ? "default" : "secondary"}>{status}</Badge>
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {session.ip ?? "IP unknown"} · {describePlace(session) ?? "Location unknown"}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    Signed in {formatDateTime(session.createdAt)} with{" "}
                    {session.method === "passkey" ? "a passkey" : "a password"} · {ended}
                  </span>
                </span>
                {live && !current ? (
                  <form action={signOutDevice}>
                    <input type="hidden" name="id" value={session.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Sign out
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
