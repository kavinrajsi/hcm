import { currentUser } from "@/lib/rbac";
import { AppShell } from "@/components/app-shell";

// The Connect an AI guide is public (AI apps link to it), but signed-in
// people reach it from the menu: give them the usual sidebar and header.
export default async function McpPublicLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return children;
  return <AppShell user={user}>{children}</AppShell>;
}
