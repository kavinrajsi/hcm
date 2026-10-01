"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/rbac";
import { disconnect } from "@/lib/mcp/connections";

/** Disconnect one of your own AI apps. */
export async function disconnectMyApp(formData: FormData) {
  const user = await requireUser();
  const clientId = formData.get("clientId");
  if (typeof clientId !== "string") return;
  await disconnect(user.id, clientId);
  revalidatePath("/profile");
  revalidatePath("/mcp-access");
}

/** HR: disconnect anyone's AI app. */
export async function disconnectAnyApp(formData: FormData) {
  await requireRole("HR_ADMIN");
  const clientId = formData.get("clientId");
  const userId = formData.get("userId");
  if (typeof clientId !== "string" || typeof userId !== "string") return;
  await disconnect(userId, clientId);
  revalidatePath("/mcp-access");
  revalidatePath("/profile");
}
