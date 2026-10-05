import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { AccountSection } from "../account-section";
import { Passkeys } from "../passkeys";
import { DeviceActivity } from "../device-activity";
import { ConnectedApps } from "../connected-apps";

export const metadata = { title: "Security" };

// Sign-in settings every login has, with or without an employee record.
export default async function ProfileSecurityPage() {
  const user = await requireUser();
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true, name: true, role: true, passwordHash: true, createdAt: true },
  });
  if (!account) return null;

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Security</h1>
      <AccountSection account={account} />
      <Passkeys userId={user.id} />
      <DeviceActivity userId={user.id} currentSessionId={user.sessionId} />
      <ConnectedApps userId={user.id} />
    </PageShell>
  );
}
