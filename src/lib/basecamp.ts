import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";

// Basecamp OAuth2 (launchpad.37signals.com) + minimal API client for the
// Quantum Sheet import. Tokens are stored encrypted per user.

const LAUNCHPAD = "https://launchpad.37signals.com";

export function basecampConfigured(): boolean {
  return Boolean(
    process.env.BASECAMP_CLIENT_ID && process.env.BASECAMP_CLIENT_SECRET,
  );
}

function redirectUri(): string {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return `${base}/api/basecamp/callback`;
}

export function authorizeUrl(): string {
  const params = new URLSearchParams({
    type: "web_server",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    redirect_uri: redirectUri(),
  });
  return `${LAUNCHPAD}/authorization/new?${params}`;
}

export async function exchangeCode(code: string) {
  const params = new URLSearchParams({
    type: "web_server",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${LAUNCHPAD}/authorization/token?${params}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Basecamp token exchange failed: ${res.status}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

/** Resolve the Basecamp 4 account id for the authorized user. */
export async function fetchAccountId(accessToken: string): Promise<string> {
  const res = await fetch(`${LAUNCHPAD}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Basecamp authorization lookup failed: ${res.status}`);
  const data = (await res.json()) as {
    accounts: { id: number; product: string }[];
  };
  const account = data.accounts.find((a) => a.product === "bc3");
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
    return { accessToken: decryptField(row.accessTokenEnc), accountId: row.accountId };
  }

  // Expired — refresh.
  if (!row.refreshTokenEnc) return null;
  const params = new URLSearchParams({
    type: "refresh",
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
    refresh_token: decryptField(row.refreshTokenEnc),
  });
  const res = await fetch(`${LAUNCHPAD}/authorization/token?${params}`, {
    method: "POST",
  });
  if (!res.ok) return null;
  const token = (await res.json()) as {
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
  const res = await fetch(`https://3.basecampapi.com/${accountId}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "HRM Quantum Sheet (internal)",
    },
  });
  if (!res.ok) throw new Error(`Basecamp API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
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
  const todoset = project.dock.find((d) => d.name === "todoset");
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
