import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { removePasskey } from "./actions";
import { AddPasskey } from "./add-passkey";

/** My Profile: passkeys that can sign in as me instead of a password. */
export async function Passkeys({ userId }: { userId: string }) {
  const passkeys = await db.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">Passkeys</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Sign in with Touch ID, Face ID, Windows Hello or your phone instead of a password.
      </p>
      {passkeys.length > 0 ? (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{passkey.name}</span>
                <span className="block text-xs text-zinc-500">
                  Added {formatDateTime(passkey.createdAt)}
                  {passkey.lastUsedAt ? ` · last used ${formatDateTime(passkey.lastUsedAt)}` : " · not used yet"}
                </span>
              </span>
              <form action={removePasskey}>
                <input type="hidden" name="id" value={passkey.id} />
                <Button type="submit" size="sm" variant="outline">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <AddPasskey />
    </section>
  );
}
