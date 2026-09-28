"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

/** Deletes one of the signed-in user's MadMax chats (messages cascade). */
export async function deleteThread(threadId: string): Promise<void> {
  const user = await requireUser();
  await db.chatThread.deleteMany({ where: { id: threadId, userId: user.id } });
  revalidatePath("/madmax");
}
