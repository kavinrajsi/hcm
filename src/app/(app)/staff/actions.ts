"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { openTodosFor, type OpenTodo } from "@/lib/basecamp-todo-counts";

/** A colleague's open Basecamp to-dos for the Staff sheet; any signed-in user. */
export async function loadOpenTodos(
  employeeId: string,
): Promise<{ todos: OpenTodo[] } | { error: string }> {
  await requireUser();
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { basecampPersonId: true },
  });
  if (!employee?.basecampPersonId) {
    return { error: "Not linked to Basecamp." };
  }
  try {
    return { todos: await openTodosFor(employee.basecampPersonId) };
  } catch {
    return { error: "Couldn't reach Basecamp. Try again." };
  }
}
