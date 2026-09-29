import { db } from "@/lib/db";
import {
  downloadAvatar,
  getAccessToken,
  listPeople,
  type BasecampPerson,
} from "@/lib/basecamp";
import { deleteDocument, uploadDocument } from "@/lib/blob";
import { readPii } from "@/lib/employee-pii";
import { leaveSyncUserId } from "@/lib/leave-sync";

// Matches Basecamp people to employees by email and keeps each employee's
// Basecamp profile picture in HCM (private blob under avatars/). Never
// creates employees or logins. Run from the Employees button, the daily
// cron or scripts/sync-basecamp-people.ts.

export type PeopleSyncResult = {
  people: number;
  matched: number;
  updated: number;
  unchanged: number;
  unmatched: { name: string; email: string }[];
  failed: number;
};

type EmployeeForIndex = {
  id: string;
  workEmail: string;
  personalEmail: string | null;
};

/** Lower-cased email → employee id; work emails always win. */
export function buildEmailIndex(employees: EmployeeForIndex[]) {
  const index = new Map<string, string>();
  for (const employee of employees) {
    const email = employee.personalEmail?.trim().toLowerCase();
    if (email) index.set(email, employee.id);
  }
  for (const employee of employees) {
    index.set(employee.workEmail.trim().toLowerCase(), employee.id);
  }
  return index;
}

/** Real people only: not clients, bots or integrations. */
export function isPerson(person: BasecampPerson): boolean {
  return !person.client && person.personable_type === "User";
}

export function matchPerson(
  person: BasecampPerson,
  index: Map<string, string>,
): string | null {
  const email = person.email_address?.trim().toLowerCase();
  return email ? (index.get(email) ?? null) : null;
}

function extension(contentType: string): string {
  const subtype = contentType.split("/")[1]?.split(";")[0] ?? "png";
  return subtype === "jpeg"
    ? "jpg"
    : subtype.replace(/[^a-z0-9]/g, "") || "png";
}

/** Runs `work` over items with at most `limit` in flight. */
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

export async function syncBasecampPeople(): Promise<PeopleSyncResult> {
  const userId = await leaveSyncUserId();
  const token = userId ? await getAccessToken(userId) : null;
  if (!token) throw new Error("Basecamp isn't connected by an HR admin.");

  const [people, employees] = await Promise.all([
    listPeople(token.accessToken, token.accountId),
    db.employee.findMany({
      // Everyone, exited included: past employees keep their picture too.
      select: {
        id: true,
        empId: true,
        workEmail: true,
        personalEmail: true,
        personalEmailEnc: true,
        basecampPersonId: true,
        avatarBlobKey: true,
        avatarSourceUrl: true,
      },
    }),
  ]);
  const index = buildEmailIndex(
    employees.map((employee) => ({
      id: employee.id,
      workEmail: employee.workEmail,
      personalEmail: readPii(employee).personalEmail ?? null,
    })),
  );
  const byId = new Map(employees.map((employee) => [employee.id, employee]));

  const result: PeopleSyncResult = {
    people: 0,
    matched: 0,
    updated: 0,
    unchanged: 0,
    unmatched: [],
    failed: 0,
  };
  const matches: { person: BasecampPerson; employeeId: string }[] = [];
  const claimed = new Set<string>();
  for (const person of people.filter(isPerson)) {
    result.people++;
    const employeeId = matchPerson(person, index);
    // One Basecamp person per employee (first match wins).
    if (!employeeId || claimed.has(employeeId)) {
      result.unmatched.push({
        name: person.name,
        email: person.email_address ?? "",
      });
      continue;
    }
    claimed.add(employeeId);
    matches.push({ person, employeeId });
  }
  result.matched = matches.length;

  await eachLimited(matches, 3, async ({ person, employeeId }) => {
    const employee = byId.get(employeeId)!;
    const personId = String(person.id);
    const avatarChanged =
      !!person.avatar_url && person.avatar_url !== employee.avatarSourceUrl;
    try {
      if (!avatarChanged) {
        if (employee.basecampPersonId !== personId) {
          await db.employee.update({
            where: { id: employeeId },
            data: { basecampPersonId: personId },
          });
        }
        result.unchanged++;
        return;
      }
      const { bytes, contentType } = await downloadAvatar(
        token.accessToken,
        person.avatar_url!,
      );
      const key = await uploadDocument(
        `avatars/${employee.empId}.${extension(contentType)}`,
        bytes,
      );
      await db.employee.update({
        where: { id: employeeId },
        data: {
          basecampPersonId: personId,
          avatarBlobKey: key,
          avatarSourceUrl: person.avatar_url,
        },
      });
      if (employee.avatarBlobKey && employee.avatarBlobKey !== key) {
        await deleteDocument(employee.avatarBlobKey).catch(() => {});
      }
      result.updated++;
    } catch (error) {
      result.failed++;
      console.error(
        "[basecamp-people]",
        employee.empId,
        error instanceof Error ? error.message : error,
      );
    }
  });

  return result;
}

export function summarize(result: PeopleSyncResult): string {
  return [
    `${result.matched} of ${result.people} people matched`,
    `${result.updated} picture${result.updated === 1 ? "" : "s"} updated`,
    `${result.unmatched.length} unmatched`,
    result.failed ? `${result.failed} failed` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
