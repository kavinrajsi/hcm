import { db } from "@/lib/db";
import {
  generalProjectConfig,
  getAccessToken,
  listPeople,
  listProjectPeople,
  updateProjectAccess,
} from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";

// New joiners get Basecamp access to All-General Stuffs. Someone already
// in Basecamp (matched by work email) is simply added to the project;
// anyone else is invited, and Basecamp emails them. Best-effort: callers
// never fail an employee save because of this.

export type BasecampOnboardResult =
  | { status: "added"; personId: string } // existing Basecamp person, now in the project
  | { status: "invited"; personId: string | null } // new to Basecamp, invitation sent
  | { status: "already"; personId: string } // already in the project
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export const ONBOARD_MESSAGES: Record<BasecampOnboardResult["status"], string> = {
  added: "Added to All-General Stuffs on Basecamp.",
  invited: "Invited to Basecamp and All-General Stuffs; they'll get an email from Basecamp.",
  already: "Already in All-General Stuffs on Basecamp.",
  skipped: "Not added to Basecamp.",
  failed: "Couldn't add them to Basecamp.",
};

export async function addEmployeeToBasecamp(employeeId: string): Promise<BasecampOnboardResult> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { name: true, workEmail: true, designation: true, dateOfExit: true },
  });
  if (!employee) return { status: "skipped", reason: "Employee not found" };
  if (employee.dateOfExit && employee.dateOfExit < new Date())
    return { status: "skipped", reason: "They have left" };

  const userId = await leaveSyncUserId();
  const token = userId ? await getAccessToken(userId) : null;
  if (!token) return { status: "skipped", reason: "Basecamp isn't connected by an HR admin" };

  const { accountId, projectId } = generalProjectConfig();
  const email = employee.workEmail.trim().toLowerCase();
  const sameEmail = (person: { email_address: string | null }) =>
    person.email_address?.trim().toLowerCase() === email;

  try {
    const inProject = (await listProjectPeople(token.accessToken, accountId, projectId)).find(sameEmail);
    if (inProject) {
      await linkPerson(employeeId, String(inProject.id));
      return { status: "already", personId: String(inProject.id) };
    }
    const known = (await listPeople(token.accessToken, accountId)).find(sameEmail);
    const result = await updateProjectAccess(
      token.accessToken,
      accountId,
      projectId,
      known
        ? { grant: [known.id] }
        : {
            create: [
              {
                name: employee.name,
                email_address: email,
                title: employee.designation,
                company_name: "Madarth",
              },
            ],
          },
    );
    const person = result.granted.find(sameEmail) ?? (known ? known : null);
    if (person) await linkPerson(employeeId, String(person.id));
    return known
      ? { status: "added", personId: String(known.id) }
      : { status: "invited", personId: person ? String(person.id) : null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Basecamp request failed";
    console.error("[basecamp-onboard]", employeeId, reason);
    return { status: "failed", reason };
  }
}

/** Remember the Basecamp person on the employee (unless someone else has it). */
async function linkPerson(employeeId: string, personId: string) {
  await db.employee.updateMany({
    where: { id: employeeId, basecampPersonId: null },
    data: { basecampPersonId: personId },
  }).catch(() => {
    // Unique clash: another employee row already holds this person.
  });
}
