import { db } from "@/lib/db";
import {
  getAccessToken,
  listAssignedTodos,
  type AssignedTodo,
} from "@/lib/basecamp";
import { eachLimited } from "@/lib/basecamp-people";
import { leaveSyncUserId } from "@/lib/leave-sync";

// Each current employee's open Basecamp to-dos, split by whether they have a
// due date, for the Staff page. Read through the HR admin's connection.

export function countOpenTodos(todos: AssignedTodo[]) {
  const open = todos.filter((todo) => !todo.completed);
  const dated = open.filter((todo) => todo.due_on).length;
  return { dated, undated: open.length - dated };
}

export async function syncOpenTodoCounts() {
  const userId = await leaveSyncUserId();
  const token = userId && (await getAccessToken(userId));
  if (!token) throw new Error("No HR admin has connected Basecamp");

  const employees = await db.employee.findMany({
    where: { dateOfExit: null, basecampPersonId: { not: null } },
    select: { id: true, basecampPersonId: true },
  });
  let synced = 0;
  let failed = 0;
  // One person's failure (left Basecamp, 404) doesn't stop the rest.
  await eachLimited(employees, 3, async (employee) => {
    try {
      const todos = await listAssignedTodos(
        token.accessToken,
        token.accountId,
        employee.basecampPersonId!,
      );
      const { dated, undated } = countOpenTodos(todos);
      await db.employee.update({
        where: { id: employee.id },
        data: {
          openTodosDated: dated,
          openTodosUndated: undated,
          openTodosSyncedAt: new Date(),
        },
      });
      synced++;
    } catch {
      failed++;
    }
  });
  return { synced, failed };
}
