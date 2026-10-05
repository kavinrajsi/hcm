import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";
import { parseNextLink } from "@/lib/leave";

// Basecamp OAuth2 (launchpad.37signals.com) + minimal API client for the
// Quantum Sheet import. Tokens are stored encrypted per user.

const LAUNCHPAD = "https://launchpad.37signals.com";

export function basecampConfigured(): boolean {
  return Boolean(
    process.env.BASECAMP_CLIENT_ID && process.env.BASECAMP_CLIENT_SECRET,
  );
}

/**
 * OAuth callback on the host the user is on (connect and callback run on
 * the same host, so both requests send the same redirect_uri). Each host
 * used must be listed as a Redirect URI in the Basecamp integration.
 */
function redirectUri(origin: string): string {
  return `${origin}/api/basecamp/callback`;
}

/**
 * Basecamp's consent page. `state` is a one-time random value the connect
 * route also keeps in a cookie; the callback only accepts a code that comes
 * back with it, so a crafted callback link can't attach someone else's
 * Basecamp account to an HR admin.
 */
export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    type: "web_server",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${LAUNCHPAD}/authorization/new?${params}`;
}

export async function exchangeCode(code: string, origin: string) {
  const params = new URLSearchParams({
    type: "web_server",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
    redirect_uri: redirectUri(origin),
    code,
  });
  const response = await fetch(`${LAUNCHPAD}/authorization/token?${params}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Basecamp token exchange failed: ${response.status}`);
  }
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

/** Resolve the Basecamp 4 account id for the authorized user. */
export async function fetchAccountId(accessToken: string): Promise<string> {
  const response = await fetch(`${LAUNCHPAD}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok)
    throw new Error(`Basecamp authorization lookup failed: ${response.status}`);
  const data = (await response.json()) as {
    accounts: { id: number; product: string }[];
  };
  const account = data.accounts.find((entry) => entry.product === "bc3");
  if (!account) throw new Error("No Basecamp 4 account on this login");
  return String(account.id);
}

export async function saveToken(
  userId: string,
  token: { access_token: string; refresh_token?: string; expires_in: number },
  accountId: string,
) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await db.basecampToken.upsert({
    where: { userId },
    update: {
      accessTokenEnc: encryptField(token.access_token),
      refreshTokenEnc: token.refresh_token
        ? encryptField(token.refresh_token)
        : undefined,
      expiresAt,
      accountId,
    },
    create: {
      userId,
      accessTokenEnc: encryptField(token.access_token),
      refreshTokenEnc: token.refresh_token
        ? encryptField(token.refresh_token)
        : null,
      expiresAt,
      accountId,
    },
  });
}

export async function getAccessToken(
  userId: string,
): Promise<{ accessToken: string; accountId: string } | null> {
  const row = await db.basecampToken.findUnique({ where: { userId } });
  if (!row) return null;

  if (row.expiresAt > new Date()) {
    return {
      accessToken: decryptField(row.accessTokenEnc),
      accountId: row.accountId,
    };
  }

  // Expired — refresh.
  if (!row.refreshTokenEnc) return null;
  const params = new URLSearchParams({
    type: "refresh",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
    refresh_token: decryptField(row.refreshTokenEnc),
  });
  const response = await fetch(`${LAUNCHPAD}/authorization/token?${params}`, {
    method: "POST",
  });
  if (!response.ok) return null;
  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  await db.basecampToken.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptField(token.access_token),
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
  });
  return { accessToken: token.access_token, accountId: row.accountId };
}

async function api<T>(
  accessToken: string,
  accountId: string,
  path: string,
): Promise<T> {
  const response = await fetch(
    `https://3.basecampapi.com/${accountId}${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "HCM Quantum Sheet (internal)",
      },
    },
  );
  if (!response.ok)
    throw new Error(`Basecamp API ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

export type BasecampProject = {
  id: number;
  name: string;
  dock: { name: string; id: number }[];
};

export type BasecampTodo = {
  id: number;
  title: string;
  app_url: string;
  updated_at: string;
};

export async function listProjects(accessToken: string, accountId: string) {
  return api<BasecampProject[]>(accessToken, accountId, "/projects.json");
}

/** Flattens a project's todoset → todolists → todos. */
export async function listProjectTodos(
  accessToken: string,
  accountId: string,
  project: BasecampProject,
): Promise<BasecampTodo[]> {
  const todoset = project.dock.find((dockItem) => dockItem.name === "todoset");
  if (!todoset) return [];
  const lists = await api<{ id: number }[]>(
    accessToken,
    accountId,
    `/buckets/${project.id}/todosets/${todoset.id}/todolists.json`,
  );
  const todos: BasecampTodo[] = [];
  for (const list of lists) {
    const items = await api<BasecampTodo[]>(
      accessToken,
      accountId,
      `/buckets/${project.id}/todolists/${list.id}/todos.json`,
    );
    todos.push(...items);
  }
  return todos;
}

// --- Leave check-ins ("Post your leave here", "Post your WFH here") ---

/** Which check-in a post came from; stored on LeaveEntry.checkin. */
export type CheckinKind = "leave" | "wfh";

export function leaveCheckinConfig(): {
  accountId: string;
  bucketId: string;
  questionId: string;
  wfhQuestionId: string;
} {
  return {
    // Fixed account — the HR admin's login may belong to several accounts.
    accountId: process.env.BASECAMP_LEAVE_ACCOUNT_ID ?? "3251537",
    bucketId: process.env.BASECAMP_LEAVE_BUCKET_ID ?? "1710547",
    questionId: process.env.BASECAMP_LEAVE_QUESTION_ID ?? "2113472792",
    wfhQuestionId: process.env.BASECAMP_WFH_QUESTION_ID ?? "7274378266",
  };
}

/** The synced check-ins, keyed by kind. */
export function syncedCheckins(): { kind: CheckinKind; questionId: string }[] {
  const { questionId, wfhQuestionId } = leaveCheckinConfig();
  return [
    { kind: "leave", questionId },
    { kind: "wfh", questionId: wfhQuestionId },
  ];
}

/** The kind of a synced check-in question, or null for any other question. */
export function checkinKind(questionId: string | number | undefined) {
  return (
    syncedCheckins().find(
      (checkin) => checkin.questionId === String(questionId),
    )?.kind ?? null
  );
}

export type BasecampAnswer = {
  id: number;
  group_on: string; // YYYY-MM-DD, the check-in day
  created_at: string;
  updated_at: string;
  content: string; // HTML
  app_url: string;
  creator: { id: number; name: string; email_address: string | null };
};

/**
 * Pages through a check-in question's answers. Basecamp orders them by
 * check-in day (group_on) desc, so with `sinceDay` (YYYY-MM-DD) paging stops
 * once a whole page is older — incremental syncs fetch only a page or two.
 */
/**
 * Every page of a Basecamp list endpoint (follows the Link header, waits
 * out 429s). `stop` ends early once a page makes the rest irrelevant.
 */
async function fetchAllPages<T>(
  accessToken: string,
  firstUrl: string,
  userAgent: string,
  stop?: (page: T[]) => boolean,
): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const response: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": userAgent,
      },
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get("Retry-After") ?? "10");
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    if (!response.ok)
      throw new Error(`Basecamp fetch failed: ${response.status} ${firstUrl}`);
    const page = (await response.json()) as T[];
    items.push(...page);
    if (stop?.(page)) break;
    url = parseNextLink(response.headers.get("Link"));
  }
  return items;
}

export async function listCheckinAnswers(
  accessToken: string,
  accountId: string,
  bucketId: string,
  questionId: string,
  sinceDay?: string,
): Promise<BasecampAnswer[]> {
  const answers = await fetchAllPages<BasecampAnswer>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/buckets/${bucketId}/questions/${questionId}/answers.json`,
    "HCM Leave Sync (internal)",
    sinceDay
      ? (page) => page.every((answer) => answer.group_on < sinceDay)
      : undefined,
  );
  return sinceDay
    ? answers.filter((answer) => answer.group_on >= sinceDay)
    : answers;
}

/** One check-in answer (webhook: re-fetch instead of trusting the payload). */
export async function getCheckinAnswer(
  accessToken: string,
  accountId: string,
  bucketId: string,
  answerId: string,
): Promise<BasecampAnswer & { parent?: { id: number } }> {
  return api(
    accessToken,
    accountId,
    `/buckets/${bucketId}/question_answers/${answerId}.json`,
  );
}

export type BasecampWebhook = {
  id: number;
  active: boolean;
  payload_url: string;
  types: string[];
};

/**
 * Registers a webhook for check-in answers on the leave project (covers both
 * the leave and WFH check-ins), unless one
 * already points at `payloadUrl` (compared without the query string, so a
 * rotated secret replaces the old hook instead of adding a second one).
 */
export async function ensureLeaveWebhook(
  accessToken: string,
  payloadUrl: string,
): Promise<{ created: boolean; webhook: BasecampWebhook }> {
  const { accountId, bucketId } = leaveCheckinConfig();
  const base = `https://3.basecampapi.com/${accountId}/buckets/${bucketId}/webhooks`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "HCM Leave Sync (internal)",
    "Content-Type": "application/json",
  };
  const list = (await (
    await fetch(`${base}.json`, { headers })
  ).json()) as BasecampWebhook[];
  const path = (url: string) => url.split("?")[0];
  const match = list.find(
    (webhook) => path(webhook.payload_url) === path(payloadUrl),
  );
  if (match && match.payload_url === payloadUrl && match.active) {
    return { created: false, webhook: match };
  }
  if (match) {
    // Same endpoint, old secret or inactive: replace it.
    await fetch(
      `https://3.basecampapi.com/${accountId}/buckets/${bucketId}/webhooks/${match.id}.json`,
      { method: "DELETE", headers },
    );
  }
  const response = await fetch(`${base}.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      payload_url: payloadUrl,
      types: ["Question::Answer"],
    }),
  });
  if (!response.ok)
    throw new Error(`Webhook create failed: ${response.status}`);
  return { created: true, webhook: (await response.json()) as BasecampWebhook };
}

// --- People (profile sync) ---

export type BasecampPerson = {
  id: number;
  name: string;
  email_address: string | null;
  avatar_url: string | null;
  title: string | null;
  personable_type: string; // "User" for people; bots and integrations differ
  client: boolean;
};

/** Everyone visible to the connected account. */
export async function listPeople(
  accessToken: string,
  accountId: string,
): Promise<BasecampPerson[]> {
  return fetchAllPages<BasecampPerson>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/people.json`,
    "HCM People Sync (internal)",
  );
}

/** Downloads a Basecamp avatar (sent with the token in case it's private). */
export async function downloadAvatar(
  accessToken: string,
  url: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "HCM People Sync (internal)",
    },
  });
  if (!response.ok)
    throw new Error(`Avatar download failed: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Avatar is not an image: ${contentType}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

// --- To-dos and comments (Assignment Intelligence) ---

export type BasecampTodoFull = {
  id: number;
  title: string;
  description: string; // HTML
  app_url: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  completion: {
    created_at: string;
    creator: { id: number; name: string } | null;
  } | null;
  comments_count: number;
  parent: { id: number; title: string; type: string };
  bucket: { id: number; name: string };
  creator: { id: number; name: string; email_address?: string | null };
  assignees: {
    id: number;
    name: string;
    email_address?: string | null;
    title?: string | null;
  }[];
};

export type BasecampComment = {
  id: number;
  content: string; // HTML
  created_at: string;
  app_url: string;
  creator: { id: number; name: string; email_address?: string | null };
};

const JOBS_AGENT = "HCM Assignment Intelligence (internal)";

/** Every to-do list (and group inside a list) of a project, active or archived. */
export async function listAllTodolists(
  accessToken: string,
  accountId: string,
  project: BasecampProject,
): Promise<{ id: number; title: string }[]> {
  const base = `https://3.basecampapi.com/${accountId}/buckets/${project.id}`;
  const lists: { id: number; title: string }[] = [];
  for (const todoset of project.dock.filter((item) => item.name === "todoset")) {
    for (const status of ["", "?status=archived"]) {
      const page = await fetchAllPages<{ id: number; title: string }>(
        accessToken,
        `${base}/todosets/${todoset.id}/todolists.json${status}`,
        JOBS_AGENT,
      );
      lists.push(...page);
    }
  }
  // To-dos inside a group are only listed under the group itself.
  const groups: { id: number; title: string }[] = [];
  for (const list of lists) {
    const page = await fetchAllPages<{ id: number; title: string }>(
      accessToken,
      `${base}/todolists/${list.id}/groups.json`,
      JOBS_AGENT,
    );
    groups.push(...page.map((group) => ({ ...group, title: list.title })));
  }
  return [...lists, ...groups];
}

/** Completed to-dos of one list or group, newest completion first. */
export async function listCompletedTodos(
  accessToken: string,
  accountId: string,
  bucketId: number,
  todolistId: number,
): Promise<BasecampTodoFull[]> {
  return fetchAllPages<BasecampTodoFull>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/buckets/${bucketId}/todolists/${todolistId}/todos.json?completed=true`,
    JOBS_AGENT,
  );
}

export async function listComments(
  accessToken: string,
  accountId: string,
  bucketId: string | number,
  recordingId: string | number,
): Promise<BasecampComment[]> {
  return fetchAllPages<BasecampComment>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/buckets/${bucketId}/recordings/${recordingId}/comments.json`,
    JOBS_AGENT,
  );
}

/**
 * To-dos across every project, most recently updated first, stopping once
 * a whole page is older than `since`. Recordings omit `completion`, so
 * callers fall back to updated_at for the completion time.
 */
export async function listTodosUpdatedSince(
  accessToken: string,
  accountId: string,
  since: Date,
): Promise<BasecampTodoFull[]> {
  const sinceIso = since.toISOString();
  const todos = await fetchAllPages<BasecampTodoFull & { completion?: unknown }>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/projects/recordings.json?type=Todo&sort=updated_at&direction=desc`,
    JOBS_AGENT,
    (page) => page.every((todo) => todo.updated_at < sinceIso),
  );
  return todos
    .filter((todo) => todo.updated_at >= sinceIso)
    .map((todo) => ({ ...todo, completion: todo.completion ?? null }) as BasecampTodoFull);
}

// --- Project access (new joiners → All-General Stuffs) ---

/** The project every new employee joins (All-General Stuffs). */
export function generalProjectConfig(): { accountId: string; projectId: string } {
  return {
    accountId: process.env.BASECAMP_LEAVE_ACCOUNT_ID ?? "3251537",
    projectId: process.env.BASECAMP_GENERAL_PROJECT_ID ?? "1710547",
  };
}

/** People who can already see a project. */
export async function listProjectPeople(
  accessToken: string,
  accountId: string,
  projectId: string,
): Promise<BasecampPerson[]> {
  return fetchAllPages<BasecampPerson>(
    accessToken,
    `https://3.basecampapi.com/${accountId}/projects/${projectId}/people.json`,
    "HCM Onboarding (internal)",
  );
}

/**
 * Grants existing people access to a project and/or invites new people
 * (Basecamp emails them an invitation). Returns who was granted.
 */
export async function updateProjectAccess(
  accessToken: string,
  accountId: string,
  projectId: string,
  body: {
    grant?: number[];
    create?: { name: string; email_address: string; title?: string; company_name?: string }[];
  },
): Promise<{ granted: BasecampPerson[] }> {
  const response = await fetch(
    `https://3.basecampapi.com/${accountId}/projects/${projectId}/people/users.json`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "HCM Onboarding (internal)",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Basecamp access update failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as { granted: BasecampPerson[] };
}

// --- To-dos written by HCM (Assign) ---

/**
 * Every to-do HCM creates or edits is marked as a test while Assignment
 * Intelligence is being evaluated. Applied here, in the only place HCM
 * writes a to-do, and never twice.
 */
export const TODO_TEST_PREFIX = "[test]";

export function testTodoTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.toLowerCase().startsWith(TODO_TEST_PREFIX)
    ? trimmed
    : `${TODO_TEST_PREFIX} ${trimmed}`;
}

export type TodoInput = {
  content: string;
  description?: string;
  assigneeIds: number[];
};

export type WrittenTodo = {
  id: number;
  app_url: string;
  content: string;
  assignees: { id: number; name: string }[];
};

async function writeTodo(
  accessToken: string,
  url: string,
  method: "POST" | "PUT",
  todo: TodoInput,
): Promise<WrittenTodo> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "HCM Assign (internal)",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: testTodoTitle(todo.content),
      description: todo.description ?? "",
      assignee_ids: todo.assigneeIds,
      // Test to-dos don't ping the assignee.
      notify: false,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Basecamp to-do ${method === "POST" ? "create" : "update"} failed: ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  return (await response.json()) as WrittenTodo;
}

/** Creates a to-do in a to-do list; the title gets the [test] prefix. */
export function createTodo(
  accessToken: string,
  list: { accountId: string; bucketId: string; todolistId: string },
  todo: TodoInput,
): Promise<WrittenTodo> {
  return writeTodo(
    accessToken,
    `https://3.basecampapi.com/${list.accountId}/buckets/${list.bucketId}/todolists/${list.todolistId}/todos.json`,
    "POST",
    todo,
  );
}

/**
 * Replaces a to-do's fields. Basecamp clears any field left out, so the
 * caller passes content, description and assignees every time.
 */
export function updateTodo(
  accessToken: string,
  where: { accountId: string; bucketId: string; todoId: string },
  todo: TodoInput,
): Promise<WrittenTodo> {
  return writeTodo(
    accessToken,
    `https://3.basecampapi.com/${where.accountId}/buckets/${where.bucketId}/todos/${where.todoId}.json`,
    "PUT",
    todo,
  );
}
