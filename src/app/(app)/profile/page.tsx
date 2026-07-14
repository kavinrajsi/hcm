import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NameForm, PasswordForm } from "./profile-forms";

export const metadata = { title: "Account" };

export default async function ProfilePage() {
  const user = await requireUser();
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      createdAt: true,
    },
  });
  if (!account) return null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Settings for your sign-in account. Employee details live on{" "}
        <a href="/me" className="underline underline-offset-4">
          My Profile
        </a>
        .
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account info</CardTitle>
            <CardDescription>
              {account.email} · <Badge variant="secondary">{account.role}</Badge>{" "}
              · member since {account.createdAt.toISOString().slice(0, 10)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NameForm defaultName={account.name ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              {account.passwordHash
                ? "Change the password you use to sign in."
                : "No password set yet — add one to sign in with credentials."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm hasPassword={account.passwordHash !== null} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
