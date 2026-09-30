import { db } from "@/lib/db";
import {
  getAccessToken,
  listAllTodolists,
  listComments,
  listCompletedTodos,
  listProjects,
  type BasecampTodoFull,
} from "@/lib/basecamp";
import { buildEmailIndex, htmlToText } from "@/lib/leave";
import { readPii } from "@/lib/employee-pii";
import { leaveSyncUserId } from "@/lib/leave-sync";

// Pulls every completed Basecamp to-do (with assignees and comments) into
// Job / JobAssignee / JobComment for Assignment Intelligence. Safe to
// re-run: a to-do whose updated_at and comment count haven't moved is
// skipped. Run from the Assign page, the daily cron or
// scripts/sync-basecamp-jobs.ts.

export type JobsSyncResult = {
  projects: number;
  lists: number;
  todos: number;
  created: number;
  updated: number;
  unchanged: number;
  comments: number;
  failed: number;
  skipped: number; // left for the next run when the time budget ran out
};

export type JobsSyncEvent =
  | { type: "step"; message: string }
  | { type: "total"; total: number }
  | {
      type: "job";
      title: string;
      bucket: string;
      status: "created" | "updated" | "unchanged" | "failed";
      error?: string;
    };

export type JobsSyncStreamEvent =
  | JobsSyncEvent
  | { type: "done"; summary: string; result: JobsSyncResult }
  | { type: "error"; message: string };

// Leaves headroom for the project/list walk inside the 300s function limit.
const DEFAULT_BUDGET_MS = 240_000;

async function eachLimited<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

export async function syncBasecampJobs(
  onProgress: (event: JobsSyncEvent) => void = () => {},
  options: { budgetMs?: number } = {},
): Promise<JobsSyncResult> {
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  onProgress({ type: "step", message: "Connecting to Basecamp…" });
  const userId = await leaveSyncUserId();
  const token = userId ? await getAccessToken(userId) : null;
  if (!token) throw new Error("Basecamp isn't connected by an HR admin.");

  const [projects, employees] = await Promise.all([
    listProjects(token.accessToken, token.accountId),
    db.employee.findMany({
      select: {
        id: true,
        workEmail: true,
        personalEmail: true,
        personalEmailEnc: true,
      },
    }),
  ]);
  const emailIndex = buildEmailIndex(
    employees.map((employee) => ({
      id: employee.id,
      workEmail: employee.workEmail,
      personalEmail: readPii(employee).personalEmail ?? null,
    })),
  );

  const result: JobsSyncResult = {
    projects: projects.length,
    lists: 0,
    todos: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    comments: 0,
    failed: 0,
    skipped: 0,
  };

  onProgress({
    type: "step",
    message: `${projects.length} projects. Loading completed to-dos…`,
  });
  const todos: BasecampTodoFull[] = [];
  for (const project of projects) {
    const lists = await listAllTodolists(
      token.accessToken,
      token.accountId,
      project,
    );
    result.lists += lists.length;
    for (const list of lists) {
      const completed = await listCompletedTodos(
        token.accessToken,
        token.accountId,
        project.id,
        list.id,
      );
      todos.push(...completed);
    }
    onProgress({
      type: "step",
      message: `${project.name}: ${lists.length} lists, ${todos.length} completed to-dos so far`,
    });
  }
  result.todos = todos.length;
  onProgress({ type: "total", total: todos.length });

  const existing = new Map(
    (
      await db.job.findMany({
        where: { basecampTodoId: { in: todos.map((todo) => String(todo.id)) } },
        select: {
          id: true,
          basecampTodoId: true,
          basecampUpdatedAt: true,
          commentsCount: true,
        },
      })
    ).map((job) => [job.basecampTodoId, job]),
  );

  await eachLimited(todos, 8, async (todo) => {
    if (Date.now() > deadline) {
      result.skipped++;
      return;
    }
    const previous = existing.get(String(todo.id));
    const updatedAt = new Date(todo.updated_at);
    if (
      previous &&
      previous.basecampUpdatedAt.getTime() === updatedAt.getTime() &&
      previous.commentsCount === todo.comments_count
    ) {
      result.unchanged++;
      onProgress({
        type: "job",
        title: todo.title,
        bucket: todo.bucket.name,
        status: "unchanged",
      });
      return;
    }
    try {
      const assignees = todo.assignees.map((assignee) => {
        const email = assignee.email_address?.trim().toLowerCase() || null;
        return {
          personId: String(assignee.id),
          name: assignee.name,
          email,
          title: assignee.title ?? null,
          employeeId: email ? (emailIndex.get(email) ?? null) : null,
        };
      });
      const data = {
        bucketId: String(todo.bucket.id),
        bucketName: todo.bucket.name,
        todolistTitle: todo.parent?.title ?? "",
        title: todo.title,
        description: htmlToText(todo.description ?? ""),
        link: todo.app_url,
        creatorPersonId: String(todo.creator.id),
        creatorName: todo.creator.name,
        creatorEmail: todo.creator.email_address?.toLowerCase() ?? null,
        createdAtBasecamp: new Date(todo.created_at),
        completedAt: new Date(todo.completion?.created_at ?? todo.updated_at),
        completedBy: todo.completion?.creator?.name ?? null,
        commentsCount: todo.comments_count,
        basecampUpdatedAt: updatedAt,
      };
      const job = previous
        ? await db.job.update({
            where: { id: previous.id },
            data: {
              ...data,
              assignees: { deleteMany: {}, create: assignees },
            },
            select: { id: true },
          })
        : await db.job.create({
            data: {
              basecampTodoId: String(todo.id),
              ...data,
              assignees: { create: assignees },
            },
            select: { id: true },
          });

      if (
        todo.comments_count > 0 &&
        (!previous || previous.commentsCount !== todo.comments_count)
      ) {
        const comments = await listComments(
          token.accessToken,
          token.accountId,
          todo.bucket.id,
          todo.id,
        );
        const { count } = await db.jobComment.createMany({
          data: comments.map((comment) => ({
            basecampId: String(comment.id),
            jobId: job.id,
            authorPersonId: String(comment.creator.id),
            authorName: comment.creator.name,
            authorEmail: comment.creator.email_address?.toLowerCase() ?? null,
            postedAt: new Date(comment.created_at),
            content: htmlToText(comment.content ?? ""),
            link: comment.app_url,
          })),
          skipDuplicates: true,
        });
        result.comments += count;
      }
      result[previous ? "updated" : "created"]++;
      onProgress({
        type: "job",
        title: todo.title,
        bucket: todo.bucket.name,
        status: previous ? "updated" : "created",
      });
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[jobs-sync]", todo.id, error);
      onProgress({
        type: "job",
        title: todo.title,
        bucket: todo.bucket.name,
        status: "failed",
        error: message,
      });
    }
  });

  return result;
}

export function summarizeJobsSync(result: JobsSyncResult): string {
  return [
    `${result.todos} completed to-dos in ${result.projects} projects`,
    `${result.created} new`,
    `${result.updated} updated`,
    `${result.comments} comments added`,
    result.failed ? `${result.failed} failed` : "",
    result.skipped ? `${result.skipped} left for next run` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
