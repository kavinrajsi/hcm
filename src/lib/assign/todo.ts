import { db } from "@/lib/db";
import { createTodo, getAccessToken, updateTodo } from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";

// Recording a pick on Assign creates a "[test] …" to-do in the Basecamp
// list HR chose, assigned to the picked designer (no notification). Nothing
// is written to Basecamp until HR sets that list.

export const TODO_LIST_SETTING = "assign.todoList";

export type TodoList = { url: string; accountId: string; bucketId: string; todolistId: string };

/** Reads a Basecamp to-do list link: https://3.basecamp.com/<account>/buckets/<project>/todolists/<list>. */
export function parseTodolistUrl(input: string): TodoList | null {
  const match = input
    .trim()
    .match(/^https:\/\/3\.basecamp\.com\/(\d+)\/buckets\/(\d+)\/todolists\/(\d+)(?:[/?#].*)?$/);
  if (!match) return null;
  const [, accountId, bucketId, todolistId] = match;
  return {
    url: `https://3.basecamp.com/${accountId}/buckets/${bucketId}/todolists/${todolistId}`,
    accountId,
    bucketId,
    todolistId,
  };
}

export function readTodoList(value: unknown): TodoList | null {
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url: unknown }).url;
    if (typeof url === "string") return parseTodolistUrl(url);
  }
  return null;
}

export async function todoList(): Promise<TodoList | null> {
  const row = await db.appSetting.findUnique({ where: { key: TODO_LIST_SETTING } });
  return readTodoList(row?.value);
}

/** First line of the brief, as a to-do title (the [test] prefix is added on write). */
export function todoContent(description: string): string {
  const firstLine = description.trim().split(/\r?\n/)[0].trim();
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The whole brief as Basecamp rich text, plus where it came from. */
export function todoDescription(description: string): string {
  const paragraphs = description
    .trim()
    .split(/\r?\n/)
    .map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`)
    .join("");
  return `${paragraphs}<div><br></div><div><em>Test to-do created from HCM Assign.</em></div>`;
}

export type TodoOutcome =
  | { status: "skipped" } // no list set
  | { status: "written"; url: string }
  | { status: "failed"; error: string };

/**
 * Creates the pick's to-do, or reassigns it when the pick changes. Never
 * throws: the pick is already saved, and a Basecamp problem is reported
 * alongside it.
 */
export async function syncChoiceTodo(query: {
  id: string;
  description: string;
  chosenPersonId: string;
  basecampTodoId: string | null;
}): Promise<TodoOutcome> {
  const list = await todoList();
  if (!list) return { status: "skipped" };
  try {
    const userId = await leaveSyncUserId();
    const token = userId ? await getAccessToken(userId) : null;
    if (!token) throw new Error("Basecamp isn't connected by an HR admin.");
    const assigneeId = Number(query.chosenPersonId);
    if (!Number.isSafeInteger(assigneeId)) throw new Error("That designer has no Basecamp id.");
    const input = {
      content: todoContent(query.description),
      description: todoDescription(query.description),
      assigneeIds: [assigneeId],
    };
    const todo = query.basecampTodoId
      ? await updateTodo(
          token.accessToken,
          { accountId: list.accountId, bucketId: list.bucketId, todoId: query.basecampTodoId },
          input,
        )
      : await createTodo(token.accessToken, list, input);
    await db.assignmentQuery.update({
      where: { id: query.id },
      data: { basecampTodoId: String(todo.id), basecampTodoUrl: todo.app_url },
    });
    // Basecamp drops assignees who can't see the project instead of failing.
    if (!todo.assignees?.some((person) => person.id === assigneeId)) {
      return {
        status: "failed",
        error: `To-do saved, but Basecamp didn't assign the designer (are they on that project?): ${todo.app_url}`,
      };
    }
    return { status: "written", url: todo.app_url };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Basecamp request failed" };
  }
}
