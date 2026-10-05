"use server";

import { signOut } from "@/lib/auth";
import { currentUser } from "@/lib/rbac";
import { revokeSession } from "@/lib/login-sessions";

export async function signOutAction() {
  const user = await currentUser();
  if (user?.sessionId) await revokeSession(user.sessionId, user.id);
  await signOut({ redirectTo: "/login" });
}
