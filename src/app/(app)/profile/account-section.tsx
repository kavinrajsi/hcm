import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatInstantDay } from "@/lib/format-date";
import { NameForm, PasswordForm } from "./profile-forms";

export type Account = {
  email: string;
  name: string | null;
  role: string;
  passwordHash: string | null;
  createdAt: Date;
};

/** Sign-in account: display name and password. Every login has one. */
export function AccountSection({ account }: { account: Account }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-medium">Account</h2>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account info</CardTitle>
            <CardDescription>
              {account.email} ·{" "}
              <Badge variant="secondary">{account.role}</Badge> · member since{" "}
              {formatInstantDay(account.createdAt)}
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
    </section>
  );
}
