import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fresh from the DB: a disabled account is signed out, a role change
  // updates the navigation straight away.
  const user = await currentUser();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}
